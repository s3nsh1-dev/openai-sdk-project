import { useRef, useState, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
function CodeBlock({ children }: ComponentPropsWithoutRef<'pre'>) {
  const code = useRef<HTMLPreElement>(null);
  const [label, setLabel] = useState('Copy code');
  async function copy() {
    try {
      await navigator.clipboard.writeText(code.current?.textContent ?? '');
      setLabel('Copied');
    } catch {
      setLabel('Copy failed');
    }
  }
  return (
    <div className="code-block">
      <button type="button" onClick={() => void copy()}>
        {label}
      </button>
      <pre ref={code}>{children}</pre>
    </div>
  );
}
export function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        pre: CodeBlock,
        img: ({ alt }) => (
          <span className="image-omitted">
            [Image omitted{alt ? `: ${alt}` : ''}]
          </span>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
