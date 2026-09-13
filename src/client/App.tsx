import { useState } from 'react';
import { consumeStream } from './stream';
export function App() {
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true); setAnswer('');
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({requestId: crypto.randomUUID(), provider:'local', thinking:false, messages:[{role:'user',content:text}]}) });
      await consumeStream(response, event => { if (event.type === 'answer_delta') setAnswer(previous => previous + event.text); if (event.type === 'error') setAnswer(previous => previous + '\n' + event.message); });
    } catch { setAnswer('Could not reach the application server.'); }
    finally { setBusy(false); }
  }
  return <main><p className="eyebrow">LOCAL CHAT LAB</p><h1>A place to ask and learn.</h1><form onSubmit={event => { event.preventDefault(); void send(); }}><label htmlFor="message">Ask your JavaScript tutor</label><textarea id="message" value={text} onChange={event => setText(event.target.value)} /><button disabled={busy || !text.trim()}>Send</button></form><p role="status">{answer || (busy ? 'Waiting for Local…' : '')}</p></main>;
}
