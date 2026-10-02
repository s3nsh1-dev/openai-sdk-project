import { Icon } from './Icon';

const starters = [
  {
    title: 'Understand a concept',
    description: 'Start with const, let, and the why behind them.',
    icon: 'code',
    prompt: 'Explain const and let with a small example.',
  },
  {
    title: 'Trace the execution',
    description: 'Follow the event loop, one step at a time.',
    icon: 'trace',
    prompt:
      'Walk me through how the JavaScript event loop runs a small example, step by step.',
  },
  {
    title: 'Try a small challenge',
    description: 'Put an idea into practice with a little exercise.',
    icon: 'challenge',
    prompt:
      'Give me a short JavaScript array exercise. Let me try it before showing the answer.',
  },
] as const;

export function Welcome({ onChoose }: { onChoose: (prompt: string) => void }) {
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-kicker">
        <span className="tiny-line" /> A LITTLE SPACE TO FIGURE THINGS OUT
      </div>
      <h2 id="welcome-title">
        Small questions.
        <br />
        <em>Lasting understanding.</em>
      </h2>
      <p className="welcome-intro">
        Your JavaScript practice space. Bring a question, follow a thought, or
        try something new.
      </p>
      <div className="starter-heading">
        <span>FIND A STARTING POINT</span>
        <span aria-hidden="true">01 — 03</span>
      </div>
      <div className="starters">
        {starters.map((starter, index) => (
          <button
            type="button"
            className="suggestion"
            key={starter.title}
            onClick={() => onChoose(starter.prompt)}
          >
            <span className="starter-number" aria-hidden="true">
              0{index + 1}
            </span>
            <span className="starter-icon">
              <Icon name={starter.icon} />
            </span>
            <span className="starter-copy">
              <strong>{starter.title}</strong>
              <span>{starter.description}</span>
            </span>
            <Icon name="arrow" />
          </button>
        ))}
      </div>
      <p className="starter-note">
        A starting point, not a script. Make it your own before sending.
      </p>
    </section>
  );
}
