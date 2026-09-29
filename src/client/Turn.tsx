import { useEffect, useState } from 'react';
import { type Attempt, isActive } from './state';
import { Markdown } from './Markdown';
export function Turn({ attempt, now }: { attempt: Attempt; now: number }) {
  const busy = isActive(attempt.status);
  const [reasoningOpen, setReasoningOpen] = useState(true);
  useEffect(() => {
    if (!busy) setReasoningOpen(false);
  }, [busy]);
  return (
    <section className="turn" aria-label="Chat turn">
      <div className="user-message">
        <span className="speaker">YOU</span>
        <p>{attempt.user}</p>
      </div>
      <div className="assistant-message">
        <span className="speaker">TUTOR</span>
        <span className="response-provider">
          {`${attempt.provider === 'local' ? 'Local' : 'Gemini'} · ${attempt.model}`}
        </span>
        <p className={`response-status ${attempt.status}`} role="status">
          {attempt.status}
          {busy
            ? ` · ${Math.max(0, Math.floor((now - attempt.startedAt) / 1000))}s`
            : ''}
        </p>
        {attempt.reasoning && (
          <details
            open={reasoningOpen}
            onToggle={(event) => setReasoningOpen(event.currentTarget.open)}
          >
            <summary>Reasoning supplied by the model</summary>
            <div className="reasoning">{attempt.reasoning}</div>
          </details>
        )}
        {attempt.answer && (
          <div className="answer">
            <Markdown text={attempt.answer} />
          </div>
        )}
        {attempt.error && (
          <p className="error" role="alert">
            {attempt.error}
          </p>
        )}
        {!busy && attempt.status !== 'completed' && (
          <p className="context-note">
            This attempt is excluded from future conversation context.
          </p>
        )}
      </div>
    </section>
  );
}
