import { useEffect, useState } from 'react';
import { consumeStream } from './stream';
import { isActive, newAttempt, reduceAttempt, type Attempt } from './state';
export function App() {
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [attempt, setAttempt] = useState<Attempt>();
  const [now, setNow] = useState(Date.now());
  const busy = Boolean(attempt && isActive(attempt.status));
  useEffect(() => { if (!busy) return; const timer = setInterval(() => setNow(Date.now()),1000); return () => clearInterval(timer); },[busy]);
  async function send() {
    const current = newAttempt(crypto.randomUUID(),text); setAttempt(current); setNow(Date.now());
    try {
      const response = await fetch('/api/chat', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:current.requestId,provider:'local',thinking,messages:[{role:'user',content:text}]})});
      await consumeStream(response, event => setAttempt(previous => previous ? reduceAttempt(previous,event) : previous));
    } catch (error) { setAttempt(previous => previous ? reduceAttempt(previous,{type:'error',requestId:current.requestId,code:'connection',message:error instanceof Error ? error.message : 'Connection failed.'}) : previous); }
  }
  return <main><p className="eyebrow">LOCAL CHAT LAB</p><h1>A place to ask and learn.</h1>
    <label><input type="checkbox" checked={thinking} disabled={busy} onChange={event => setThinking(event.target.checked)}/> Local thinking</label>
    {attempt && <section><p>{attempt.user}</p><p role="status">{attempt.status}{busy ? ` · ${Math.max(0,Math.floor((now-attempt.startedAt)/1000))}s` : ''}</p>
      {attempt.reasoning && <details open={busy}><summary>Reasoning supplied by the model</summary><pre>{attempt.reasoning}</pre></details>}
      <div className="answer">{attempt.answer}</div>{attempt.error && <p role="alert">{attempt.error}</p>}</section>}
    <form onSubmit={event => {event.preventDefault();void send();}}><label htmlFor="message">Ask your JavaScript tutor</label><textarea id="message" value={text} onChange={event => setText(event.target.value)}/><button disabled={busy || !text.trim()}>Send</button></form>
  </main>;
}
