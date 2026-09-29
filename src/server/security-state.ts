import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Config } from './config';
import type { ChatRequest } from '../shared/protocol';

export type Rejection = {
  status: 409 | 429;
  error: string;
  retryAfter?: number;
};

// This stores security counters only. Conversations, credentials, and model output never enter it.
export function createSecurityState(config: Config) {
  const filename = config.SECURITY_STATE_PATH;
  if (filename !== ':memory:')
    mkdirSync(path.dirname(path.resolve(filename)), {
      recursive: true,
      mode: 0o700,
    });
  const database = new DatabaseSync(filename);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  database.exec(`
    PRAGMA busy_timeout = 1000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS requests (
      scope TEXT NOT NULL, principal TEXT NOT NULL, timestamp INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS requests_by_principal ON requests(scope, principal, timestamp);
    CREATE TABLE IF NOT EXISTS daily_usage (
      day TEXT NOT NULL, provider TEXT NOT NULL, tokens INTEGER NOT NULL,
      PRIMARY KEY(day, provider)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS active_generations (
      provider TEXT PRIMARY KEY, lease TEXT NOT NULL, expires INTEGER NOT NULL
    ) STRICT;
  `);
  let closed = false;
  let closing = false;
  const ownedLeases = new Set<string>();
  function closeWhenIdle() {
    if (closing && !closed && ownedLeases.size === 0) {
      database.close();
      closed = true;
    }
  }
  function transaction<T>(operation: () => T): T {
    if (closing) throw new Error('Security state is shutting down.');
    database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      database.exec('COMMIT');
      return result;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
  function takeRate(
    scope: string,
    principal: string,
    limit: number,
    now: number,
  ) {
    database
      .prepare('DELETE FROM requests WHERE timestamp <= ?')
      .run(now - 60000);
    const count = database
      .prepare(
        'SELECT count(*) AS count FROM requests WHERE scope = ? AND principal = ?',
      )
      .get(scope, principal)!.count as number;
    // Also bound storage when many different network clients send rejected requests.
    const total = database
      .prepare('SELECT count(*) AS count FROM requests')
      .get()!.count as number;
    if (count >= limit || total >= 20000) return false;
    database
      .prepare('INSERT INTO requests VALUES (?, ?, ?)')
      .run(scope, principal, now);
    return true;
  }
  return {
    takeHttp(principal: string) {
      return transaction(() =>
        takeRate('http', principal, config.HTTP_RATE_LIMIT, Date.now()),
      );
    },
    takeAuthFailure(address: string) {
      return transaction(() =>
        takeRate('auth', address, config.AUTH_FAILURE_LIMIT, Date.now()),
      );
    },
    acquire(
      principal: string,
      provider: ChatRequest['provider'],
      tokens: number,
    ): { release: () => void } | Rejection {
      const reservation = transaction<Rejection | { lease: string }>(() => {
        const now = Date.now();
        database
          .prepare('DELETE FROM active_generations WHERE expires <= ?')
          .run(now);
        if (
          database
            .prepare(
              'SELECT provider FROM active_generations WHERE provider = ?',
            )
            .get(provider)
        )
          return {
            status: 409,
            error:
              'This provider is busy with another request. Stop it or wait, then retry.',
          };
        const day = new Date(now).toISOString().slice(0, 10);
        const used = (database
          .prepare(
            'SELECT tokens FROM daily_usage WHERE day = ? AND provider = ?',
          )
          .get(day, provider)?.tokens ?? 0) as number;
        if (used + tokens > config.DAILY_TOKEN_LIMIT)
          return {
            status: 429,
            error:
              'Daily provider token allowance reached. Try after the next UTC day or ask the owner to review the budget.',
            retryAfter: Math.max(
              1,
              Math.ceil(
                (Date.parse(`${day}T00:00:00Z`) + 86400000 - now) / 1000,
              ),
            ),
          };
        if (!takeRate('chat', principal, config.RATE_LIMIT, now))
          return {
            status: 429,
            error:
              'Application request limit reached. Wait one minute and retry.',
            retryAfter: 60,
          };
        // Reserve the conservative input estimate plus the full output cap before spending provider quota.
        // Do not refund errors or cancellations: the provider may already have performed billable work.
        database
          .prepare(
            'INSERT INTO daily_usage VALUES (?, ?, ?) ON CONFLICT(day, provider) DO UPDATE SET tokens = tokens + excluded.tokens',
          )
          .run(day, provider, tokens);
        database
          .prepare('DELETE FROM daily_usage WHERE day < ?')
          .run(new Date(now - 31 * 86400000).toISOString().slice(0, 10));
        const lease = randomUUID();
        database
          .prepare('INSERT INTO active_generations VALUES (?, ?, ?)')
          .run(provider, lease, now + config.OVERALL_MS + 10000);
        return { lease };
      });
      if ('status' in reservation) return reservation;
      ownedLeases.add(reservation.lease);
      return {
        release() {
          if (!ownedLeases.has(reservation.lease)) return;
          try {
            database
              .prepare(
                'DELETE FROM active_generations WHERE provider = ? AND lease = ?',
              )
              .run(provider, reservation.lease);
          } finally {
            ownedLeases.delete(reservation.lease);
            closeWhenIdle();
          }
        },
      };
    },
    close() {
      // HTTP connections can close before the SDK iterator has finished unwinding.
      // Keep this connection alive until every lease we own has been released.
      closing = true;
      closeWhenIdle();
    },
  };
}
export type SecurityState = ReturnType<typeof createSecurityState>;
