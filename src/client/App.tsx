import { useEffect, useRef, useState } from 'react';
import { consumeStream } from './stream';
import { contextMessages, isActive, newAttempt, reduceAttempt, type Attempt } from './state';
import { Turn } from './Turn';
export function App() {
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [now, setNow] = useState(Date.now());
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const requestActive = useRef(false);
  const latest = attempts.at(-1);
  const busy = Boolean(latest && isActive(latest.status));
  useEffect(() => { if (!busy) return; const timer = setInterval(() => setNow(Date.now()),1000); return () => clearInterval(timer); },[busy]);
  useEffect(() => { if (!awayFromBottom && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; },[attempts,awayFromBottom]);
  async function send() {
    if (requestActive.current || !text.trim()) return;
    requestActive.current = true;
    const current = newAttempt(crypto.randomUUID(),text.trim());
    const messages = contextMessages(attempts,current.user);
    setAttempts(previous => [...previous,current]); setText(''); setNow(Date.now());
    function apply(event: Parameters<typeof reduceAttempt>[1]) { setAttempts(previous => previous.map(attempt => reduceAttempt(attempt,event))); }
    try {
      const response = await fetch('/api/chat', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:current.requestId,provider:'local',thinking,messages})});
      await consumeStream(response, apply);
    } catch (error) { apply({type:'error',requestId:current.requestId,code:'connection',message:error instanceof Error ? error.message : 'Connection failed.'}); }
    finally { requestActive.current = false; composer.current?.focus(); }
  }
  function newChat() { setAttempts([]); setThinking(false); setText(''); setAwayFromBottom(false); composer.current?.focus(); }
  return <main className="app">
    <header><div><p className="eyebrow">LOCAL CHAT LAB</p><h1>Ask. Try. Understand.</h1></div><button className="quiet" type="button" disabled={busy} onClick={newChat}>New chat</button></header>
    <div className="settings"><span className="provider-badge">Local · qwen3.5:4b</span><label><input type="checkbox" checked={thinking} disabled={busy} onChange={event => setThinking(event.target.checked)}/> Local thinking</label></div>
    <div className="conversation" ref={scroll} onScroll={() => {const element = scroll.current; if (element) setAwayFromBottom(element.scrollHeight-element.scrollTop-element.clientHeight > 100);}}>
      {attempts.length === 0 && <section className="welcome"><span className="welcome-mark">{'>_'}</span><h2>Your JavaScript practice space.</h2><p>Ask a question, work through an example, or find out why your code behaves that way.</p><button className="suggestion" onClick={() => {setText('Explain const and let with a small example.');composer.current?.focus();}}>Explain const and let <span aria-hidden="true">↗</span></button><p className="privacy">One conversation, kept in this tab. Refreshing clears it.</p></section>}
      {attempts.map(attempt => <Turn key={attempt.requestId} attempt={attempt} now={now}/>)}
    </div>
    {awayFromBottom && <button className="jump" type="button" onClick={() => {setAwayFromBottom(false);if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;}}>Jump to latest</button>}
    <form className="composer" onSubmit={event => {event.preventDefault();void send();}}>
      <label htmlFor="message">Message your tutor</label><textarea ref={composer} id="message" rows={3} value={text} placeholder="What are you working on?" onChange={event => setText(event.target.value)} onKeyDown={event => {if(event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229){event.preventDefault();void send();}}}/>
      <div className="composer-footer"><span>Enter to send · Shift+Enter for a new line</span><button className="primary" disabled={busy || !text.trim()}>Send message</button></div>
    </form><p className="footnote">Answers can be wrong. Read and test generated code before using it.</p>
  </main>;
}
