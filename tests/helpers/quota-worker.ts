// A separate process used to verify SQLite locking and restart persistence. No HTTP/model calls.
import { loadConfig } from '../../src/server/config';
import { createSecurityState } from '../../src/server/security-state';
const state = createSecurityState(
  loadConfig({
    NODE_ENV: 'test',
    SECURITY_STATE_PATH: process.argv[2],
    RATE_LIMIT: '1',
  }),
);
try {
  const reservation = state.acquire('worker-owner', 'local', 3840);
  const status = 'status' in reservation ? reservation.status : 200;
  if ('release' in reservation) reservation.release();
  console.log(JSON.stringify({ status }));
} finally {
  state.close();
}
