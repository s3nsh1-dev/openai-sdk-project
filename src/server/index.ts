import { createApp } from './app';
import { loadConfig } from './config';
// npm start forces production policy even if .env contains NODE_ENV=development.
const config = loadConfig({
  ...process.env,
  ...(process.argv.includes('--production') ? { NODE_ENV: 'production' } : {}),
});
const app = createApp(config);
const server = app.listen(config.PORT, '127.0.0.1', () => {
  console.info(`Local chat: http://127.0.0.1:${config.PORT}`);
});
server.headersTimeout = 15000;
server.requestTimeout = 30000;
server.maxRequestsPerSocket = 100;
server.maxConnections = 128;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    const forcedExit = setTimeout(() => process.exit(1), 5000);
    forcedExit.unref();
    server.close(() => app.locals.closeSecurityState());
    server.closeAllConnections();
  });
}
