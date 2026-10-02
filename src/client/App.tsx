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
import { Icon } from './Icon';
import { Welcome } from './Welcome';
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
      // Follow response output, but let a fresh chat start at its introduction.
      scroll.current.scrollTop = attempts.length
        ? scroll.current.scrollHeight
        : 0;
  }, [attempts]);
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
    <div className="app">
      <a className="skip-link" href="#message">
        Skip to message
      </a>
      <aside className="control-rail" aria-label="Chat controls">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <div>
            <span className="brand-name">
              local chat<span className="brand-period">.</span>
            </span>
            <span className="brand-caption">A PERSONAL PRACTICE DESK</span>
          </div>
        </div>
        <button className="new-chat" type="button" onClick={newChat}>
          <Icon name="plus" />
          New chat
        </button>
        <div className="desk-note">
          <span className="eyebrow">THIS SESSION</span>
          <p>
            {attempts.length === 0
              ? 'A fresh page.'
              : `${attempts.length} ${attempts.length === 1 ? 'question' : 'questions'} explored.`}
          </p>
          <span>
            Room to ask, experiment,
            <br />
            and connect the dots.
          </span>
          <div className="desk-diagram" aria-hidden="true">
            <span />
            <i />
            <span />
            <i />
            <span />
          </div>
          <div className="desk-steps" aria-hidden="true">
            <span>ASK</span>
            <span>TRY</span>
            <span>LEARN</span>
          </div>
        </div>
        <section className="settings" aria-label="Response settings">
          <div className="provider-setting">
            <label className="eyebrow" htmlFor="provider">
              Provider
            </label>
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
            <span className="provider-badge">
              {config?.providers[provider].model ?? 'Loading configuration…'}
            </span>
          </div>
          <div className="thinking-setting">
            <label className="thinking-toggle">
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
              />
              <span>
                {provider === 'local'
                  ? 'Local thinking'
                  : 'Gemini thought summaries'}
              </span>
            </label>
            <p id="thinking-help" className="thinking-help">
              {provider === 'local'
                ? 'Thinking shares the available context. Shorter chats leave more room for a complete reply.'
                : 'Requests a thought summary when supplied. Gemini thinks automatically.'}
            </p>
          </div>
        </section>
        <p className="rail-footnote">
          <span className="session-dot" aria-hidden="true" />
          Kept in this tab. Refreshing clears it.
        </p>
      </aside>
      <main className="workspace" aria-label="Practice desk">
        <header className="workspace-header">
          <div className="workspace-title">
            <span className="workspace-index" aria-hidden="true">
              01 /
            </span>
            <h1>Practice desk</h1>
            <span className="subject-tag">JavaScript</span>
          </div>
          <span className="session-label">ONE CONVERSATION. YOUR PACE.</span>
        </header>
        {configError && (
          <p className="error config-error" role="alert">
            {configError}
          </p>
        )}
        {provider === 'gemini' && (
          <p className="cloud-note">
            Sending or retrying with Gemini sends your question and completed
            conversation history to Google. Availability reflects configuration,
            not a connectivity check.
          </p>
        )}
        <div
          className="conversation"
          ref={scroll}
          tabIndex={0}
          role="region"
          aria-label="Conversation"
          onScroll={() => {
            // Welcome content is ordinary reading, not a response to follow.
            if (attempts.length === 0) return;
            const element = scroll.current;
            if (element) {
              const away =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight >
                100;
              followLatest.current = !away;
              setAwayFromBottom(away);
            }
          }}
        >
          <div className="conversation-inner">
            {attempts.length === 0 && (
              <Welcome
                onChoose={(prompt) => {
                  setText(prompt);
                  composer.current?.focus();
                }}
              />
            )}
            {attempts.map((attempt, index) => (
              <Turn
                key={attempt.requestId}
                attempt={attempt}
                now={now}
                number={index + 1}
              />
            ))}
          </div>
        </div>
        <div className="compose-area">
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
              Jump to latest <span aria-hidden="true">↓</span>
            </button>
          )}
          {latest && !busy && latest.status !== 'completed' && (
            <button
              className="retry"
              type="button"
              onClick={() => void send(true)}
            >
              Retry last turn <Icon name="arrow" />
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
              rows={2}
              value={text}
              placeholder="A question, an idea, a piece of code…"
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
              <span className="keyboard-hint">
                <kbd>↵</kbd> Send <span className="hint-divider">/</span>{' '}
                <kbd>Shift ↵</kbd> New line
              </span>
              {busy ? (
                <button
                  type="button"
                  className="primary stop-button"
                  onClick={stop}
                >
                  Stop response <Icon name="stop" />
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={
                    !text.trim() ||
                    !config ||
                    !config.providers[provider].available
                  }
                >
                  Send message <Icon name="arrow" />
                </button>
              )}
            </div>
          </form>
          <p className="footnote">
            <span className="mobile-memory">
              Kept in this tab. Refreshing clears it.
            </span>
            Stay curious. Answers can be wrong; read and test generated code.
          </p>
        </div>
      </main>
    </div>
  );
}
