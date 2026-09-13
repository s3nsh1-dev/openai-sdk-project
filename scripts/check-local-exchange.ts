import { createApp } from '../src/server/app';
import { loadConfig } from '../src/server/config';
import { listen, close } from '../tests/helpers/servers';
const app = await listen(createApp(loadConfig()));
try {
  const response = await fetch(`${app.url}/api/chat`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({requestId:'live-stage-2',provider:'local',thinking:false,messages:[{role:'user',content:'What is 2 + 2? Reply with just the number.'}]}) });
  const result = await response.json();
  if (!response.ok || !result.answer?.includes('4')) throw new Error('Local exchange failed.');
  console.info('Live Stage 2 exchange passed: nonempty answer containing 4.');
} finally { await close(app.server); }
