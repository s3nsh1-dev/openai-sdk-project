import { useState } from 'react';
export function App() {
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true); setAnswer('');
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({requestId: crypto.randomUUID(), provider:'local', thinking:false, messages:[{role:'user',content:text}]}) });
      const result = await response.json(); setAnswer(response.ok ? result.answer : result.error);
    } catch { setAnswer('Could not reach the application server.'); }
    finally { setBusy(false); }
  }
  return <main><p className="eyebrow">LOCAL CHAT LAB</p><h1>A place to ask and learn.</h1><form onSubmit={event => { event.preventDefault(); void send(); }}><label htmlFor="message">Ask your JavaScript tutor</label><textarea id="message" value={text} onChange={event => setText(event.target.value)} /><button disabled={busy || !text.trim()}>Send</button></form><p role="status">{busy ? 'Waiting for Local…' : answer}</p></main>;
}
