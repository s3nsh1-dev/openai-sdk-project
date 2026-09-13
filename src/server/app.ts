import express, { type ErrorRequestHandler } from 'express';
import { chatRequestSchema } from '../shared/protocol';
import { completeLocal } from './provider';
import path from 'node:path';
import { type Config, publicConfig } from './config';
export function createApp(config: Config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb' }));
  app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.get('/api/config', (_req, res) => { res.json(publicConfig(config)); });
  app.post('/api/chat', async (req, res) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid conversation input.' }); return; }
    if (parsed.data.provider !== 'local') { res.status(503).json({ error: 'Gemini is not enabled in this checkpoint.' }); return; }
    try { res.json(await completeLocal(config, parsed.data)); }
    catch { res.status(502).json({ error: 'Local model unavailable. Check Ollama and the selected model.' }); }
  });
  const errors: ErrorRequestHandler = (_error, _req, res, _next) => { res.status(400).json({ error: 'Invalid or oversized JSON body.' }); };
  app.use(errors);
  app.use(express.static(path.resolve('dist/client')));
  return app;
}
