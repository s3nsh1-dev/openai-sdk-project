import { useEffect, useState } from 'react';
import { type Attempt, isActive } from './state';
import { Markdown } from './Markdown';
export function Turn({
  attempt,
  now,
  number,
}: {
  attempt: Attempt;
  now: number;
  number?: number;
}) {
  const busy = isActive(attempt.status);
  const [reasoningOpen, setReasoningOpen] = useState(true);
  useEffect(() => {
    if (!busy) setReasoningOpen(false);
  }, [busy]);
  return (
    <section className="turn" aria-label="Chat turn">
      <div className="user-message">
        <div className="question-heading">
          <span className="speaker">YOU ASKED</span>
          <span className="turn-number" aria-hidden="true">
            {String(number ?? 1).padStart(2, '0')}
          </span>
        </div>
        <p>{attempt.user}</p>
      </div>
      <div className="assistant-message">
        <div className="response-heading">
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
        </div>
        {attempt.reasoning && (
          <details
            open={reasoningOpen}
            onToggle={(event) => setReasoningOpen(event.currentTarget.open)}
          >
            <summary>Reasoning supplied by the model</summary>
            <div className="reasoning">
              <Markdown text={attempt.reasoning} />
            </div>
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
