import express, { type ErrorRequestHandler } from 'express';
import { chat } from './chat';
import path from 'node:path';
import { type Config, publicConfig } from './config';
export function createApp(config: Config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb' }));
  app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.get('/api/config', (_req, res) => { res.json(publicConfig(config)); });
  app.post('/api/chat', (req, res) => chat(config, req, res));
  const errors: ErrorRequestHandler = (_error, _req, res, _next) => { res.status(400).json({ error: 'Invalid or oversized JSON body.' }); };
  app.use(errors);
  app.use(express.static(path.resolve('dist/client')));
  return app;
}
