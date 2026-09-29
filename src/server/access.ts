import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Config } from './config';
import type { SecurityState } from './security-state';

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const localAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const digest = (value: string) => createHash('sha256').update(value).digest();

export function securityHeaders(config: Config): RequestHandler {
  return (_req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cache-Control': 'no-store',
    });
    if (
      config.ACCESS_MODE === 'protected' &&
      config.PUBLIC_ORIGIN.startsWith('https:')
    )
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  };
}

export function accessControl(
  config: Config,
  state: SecurityState,
): RequestHandler {
  const expected = digest(`${config.AUTH_USERNAME}:${config.AUTH_PASSWORD}`);
  const publicHost =
    config.ACCESS_MODE === 'protected'
      ? new URL(config.PUBLIC_ORIGIN).host
      : undefined;
  return (req, res, next) => {
    const authority = req.headers.host;
    let host: URL;
    try {
      const hostHeaders = req.rawHeaders.filter(
        (_, index) =>
          index % 2 === 0 && req.rawHeaders[index].toLowerCase() === 'host',
      ).length;
      if (hostHeaders !== 1 || !authority || /[\s,/@\\?#]/.test(authority))
        throw new Error('Invalid Host');
      host = new URL(`http://${authority}`);
      if (
        host.host !== authority.toLowerCase() ||
        host.username ||
        host.password
      )
        throw new Error('Noncanonical Host');
    } catch {
      res.status(421).json({ error: 'Unexpected request host.' });
      return;
    }
    const address = req.socket.remoteAddress ?? '';
    if (
      config.ACCESS_MODE === 'local'
        ? !localHosts.has(host.hostname) || !localAddresses.has(address)
        : host.host !== publicHost
    ) {
      res.status(421).json({ error: 'Unexpected request host.' });
      return;
    }
    const origin = req.headers.origin;
    const allowedOrigin =
      config.ACCESS_MODE === 'protected'
        ? origin === config.PUBLIC_ORIGIN
        : origin === `http://${host.host}` ||
          origin === 'http://127.0.0.1:5173' ||
          origin === 'http://localhost:5173';
    const fetchSite = req.headers['sec-fetch-site'];
    // Images/frames from another same-site origin can carry cached Basic credentials without Origin.
    // Reject them before authentication and quota accounting, while allowing explicit development origins.
    if (
      (origin !== undefined && !allowedOrigin) ||
      fetchSite === 'cross-site' ||
      (fetchSite === 'same-site' && !allowedOrigin)
    ) {
      res.status(403).json({ error: 'This browser origin is not allowed.' });
      return;
    }
    // Forwarded headers are deliberately ignored. Only the configured host and owner credentials grant access.
    let principal = `local:${address}`;
    if (config.ACCESS_MODE === 'protected') {
      const authorization = req.headers.authorization ?? '';
      const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
      const decoded =
        match && match[1].length <= 1024
          ? Buffer.from(match[1], 'base64')
          : undefined;
      const valid = Boolean(
        decoded &&
        decoded.toString('base64') === match![1] &&
        timingSafeEqual(digest(decoded.toString('utf8')), expected),
      );
      if (!valid) {
        // A browser first requests a challenge without credentials. Counting that
        // as a password guess lets anyone prevent new owner sessions from signing in.
        if (authorization && !state.takeAuthFailure(address)) {
          res.setHeader('Retry-After', '60');
          res.status(429).json({
            error: 'Too many failed access attempts. Wait one minute.',
          });
        } else {
          res.setHeader(
            'WWW-Authenticate',
            'Basic realm="Local chat", charset="UTF-8"',
          );
          res.status(401).json({ error: 'Owner authentication is required.' });
        }
        return;
      }
      principal = `owner:${config.AUTH_USERNAME}`;
    }
    res.locals.principal = principal;
    // Runs before JSON parsing and includes malformed requests and static/API routes.
    if (!state.takeHttp(principal)) {
      res.setHeader('Retry-After', '60');
      res
        .status(429)
        .json({ error: 'HTTP request limit reached. Wait one minute.' });
      return;
    }
    next();
  };
}
