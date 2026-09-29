import { useEffect, useRef, useState } from 'react';
import { consumeStream } from './stream';
import {
  contextMessages,
  isActive,
  newAttempt,
  reduceAttempt,
  type Attempt,
} from './state';
import {
  publicConfigSchema,
  type PublicConfig,
  type ChatRequest,
} from '../shared/protocol';
import { Turn } from './Turn';
export function App() {
  const [config, setConfig] = useState<PublicConfig>();
  const [configError, setConfigError] = useState('');
  const [provider, setProvider] = useState<ChatRequest['provider']>('local');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Could not load provider configuration.');
        setConfig(publicConfigSchema.parse(await response.json()));
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setConfigError(
            'Could not load provider configuration. Reload after checking the server.',
          );
      });
    return () => controller.abort();
  }, []);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [geminiSummaries, setGeminiSummaries] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [now, setNow] = useState(Date.now());
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  // Read synchronously in effects so a queued render cannot override a user scroll.
  const followLatest = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  const activeRequest = useRef<{
    requestId: string;
    controller: AbortController;
  } | null>(null);
  useEffect(() => () => activeRequest.current?.controller.abort(), []);
  const latest = attempts.at(-1);
  const busy = Boolean(latest && isActive(latest.status));
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (followLatest.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [attempts, awayFromBottom]);
  async function send(retry = false) {
    if (
      !config ||
      !config.providers[provider].available ||
      activeRequest.current ||
      (!retry && !text.trim())
    )
      return;
    if (
      retry &&
      (!latest || isActive(latest.status) || latest.status === 'completed')
    )
      return;
    const current = newAttempt(
      crypto.randomUUID(),
      retry ? latest!.user : text.trim(),
      provider,
      config.providers[provider].model,
    );
    // Selection describes the next request; each attempt keeps its own settings.
    const currentThinking = provider === 'local' ? thinking : geminiSummaries;
    const history = retry ? attempts.slice(0, -1) : attempts;
    const messages = contextMessages(history, current.user);
    const controller = new AbortController();
    activeRequest.current = { requestId: current.requestId, controller };
    setAttempts([...history, current]);
    if (!retry) setText('');
    setNow(Date.now());
    function apply(event: Parameters<typeof reduceAttempt>[1]) {
      setAttempts((previous) =>
        previous.map((attempt) => reduceAttempt(attempt, event)),
      );
    }
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: current.requestId,
          provider: current.provider,
          thinking: currentThinking,
          messages,
        }),
        signal: controller.signal,
      });
      await consumeStream(response, apply, current.requestId);
    } catch (error) {
      if (!controller.signal.aborted)
        apply({
          type: 'error',
          requestId: current.requestId,
          code: 'connection',
          message:
            error instanceof Error ? error.message : 'Connection failed.',
        });
    } finally {
      if (activeRequest.current?.requestId === current.requestId) {
        activeRequest.current = null;
        composer.current?.focus();
      }
    }
  }
  function stop() {
    const request = activeRequest.current;
    if (!request) return;
    activeRequest.current = null;
    setAttempts((previous) =>
      previous.map((attempt) =>
        attempt.requestId === request.requestId && isActive(attempt.status)
          ? { ...attempt, status: 'stopped' }
          : attempt,
      ),
    );
    request.controller.abort();
    composer.current?.focus();
  }
  function newChat() {
    stop();
    setAttempts([]);
    setProvider('local');
    setThinking(false);
    setGeminiSummaries(false);
    setText('');
    followLatest.current = true;
    setAwayFromBottom(false);
    composer.current?.focus();
  }
  function changeProvider(nextProvider: ChatRequest['provider']) {
    if (
      !config ||
      activeRequest.current ||
      !config.providers[nextProvider].available
    )
      return;
    setProvider(nextProvider);
  }
  return (
    <main className="app">
      <header>
        <div>
          <p className="eyebrow">LOCAL CHAT</p>
          <h1>Ask. Try. Understand.</h1>
        </div>
        <button className="quiet" type="button" onClick={newChat}>
          New chat
        </button>
      </header>
      <div className="settings">
        <label htmlFor="provider">
          Provider
          <select
            id="provider"
            value={provider}
            disabled={busy || !config}
            onChange={(event) =>
              changeProvider(event.target.value as ChatRequest['provider'])
            }
          >
            <option value="local">Local</option>
            <option
              value="gemini"
              disabled={!config?.providers.gemini.available}
            >
              Gemini
              {config && !config.providers.gemini.available
                ? ' · key not configured'
                : ''}
            </option>
          </select>
        </label>
        <span className="provider-badge">
          {config?.providers[provider].model ?? 'Loading configuration…'}
        </span>
        <label>
          <input
            type="checkbox"
            checked={provider === 'local' ? thinking : geminiSummaries}
            disabled={busy}
            aria-describedby="thinking-help"
            onChange={(event) =>
              provider === 'local'
                ? setThinking(event.target.checked)
                : setGeminiSummaries(event.target.checked)
            }
          />{' '}
          {provider === 'local' ? 'Local thinking' : 'Gemini thought summaries'}
        </label>
      </div>
      <p id="thinking-help" className="thinking-help">
        {provider === 'local'
          ? 'Thinking and answers share the available context. Shorter chats leave more room for a complete reply.'
          : 'Gemini thinks automatically. This option requests a thought summary when the model supplies one.'}
      </p>
      {configError && (
        <p className="error" role="alert">
          {configError}
        </p>
      )}
      {provider === 'gemini' && (
        <p className="cloud-note">
          Sending or retrying with Gemini sends your question and completed
          conversation history to Google. Provider availability reflects
          configuration, not a connectivity check.
        </p>
      )}
      <div
        className="conversation"
        ref={scroll}
        onScroll={() => {
          const element = scroll.current;
          if (element) {
            const away =
              element.scrollHeight - element.scrollTop - element.clientHeight >
              100;
            followLatest.current = !away;
            setAwayFromBottom(away);
          }
        }}
      >
        {attempts.length === 0 && (
          <section className="welcome">
            <span className="welcome-mark">{'>_'}</span>
            <h2>Your JavaScript practice space.</h2>
            <p>
              Ask a question, work through an example, or find out why your code
              behaves that way.
            </p>
            <button
              className="suggestion"
              onClick={() => {
                setText('Explain const and let with a small example.');
                composer.current?.focus();
              }}
            >
              Explain const and let <span aria-hidden="true">↗</span>
            </button>
            <p className="privacy">
              One conversation, kept in this tab. Refreshing clears it.
            </p>
          </section>
        )}
        {attempts.map((attempt) => (
          <Turn key={attempt.requestId} attempt={attempt} now={now} />
        ))}
      </div>
      {awayFromBottom && (
        <button
          className="jump"
          type="button"
          onClick={() => {
            followLatest.current = true;
            setAwayFromBottom(false);
            if (scroll.current)
              scroll.current.scrollTop = scroll.current.scrollHeight;
          }}
        >
          Jump to latest
        </button>
      )}
      {latest && !busy && latest.status !== 'completed' && (
        <button className="retry" type="button" onClick={() => void send(true)}>
          Retry last turn
        </button>
      )}
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label htmlFor="message">Message your tutor</label>
        <textarea
          ref={composer}
          id="message"
          rows={3}
          value={text}
          placeholder="What are you working on?"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="composer-footer">
          <span>Enter to send · Shift+Enter for a new line</span>
          <div>
            {busy ? (
              <button type="button" className="primary" onClick={stop}>
                Stop response
              </button>
            ) : (
              <button className="primary" disabled={!text.trim() || !config}>
                Send message
              </button>
            )}
          </div>
        </div>
      </form>
      <p className="footnote">
        Answers can be wrong. Read and test generated code before using it.
      </p>
    </main>
  );
}
