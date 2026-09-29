import express, { type ErrorRequestHandler } from 'express';
import type { Providers } from './provider';
import { createChatHandler } from './chat';
import path from 'node:path';
import { type Config, publicConfig } from './config';
import { accessControl, securityHeaders } from './access';
import { createSecurityState } from './security-state';
export function createApp(
  config: Config,
  dependencies: { providers?: Providers } = {},
) {
  const app = express();
  const securityState = createSecurityState(config);
  app.locals.closeSecurityState = () => securityState.close();
  app.set('env', config.NODE_ENV);
  app.disable('x-powered-by');
  app.use(securityHeaders(config));
  app.use(accessControl(config, securityState));
  app.use(express.json({ limit: '128kb' }));
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/api/config', (_req, res) => {
    res.json(publicConfig(config));
  });
  app.post(
    '/api/chat',
    createChatHandler(config, dependencies.providers, undefined, securityState),
  );
  app.use(
    express.static(path.resolve('dist/client'), {
      cacheControl: false,
      dotfiles: 'deny',
    }),
  );
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    const bodyError =
      typeof error?.type === 'string' &&
      /^(entity\.|encoding\.|charset\.|request\.|stream\.)/.test(error.type);
    res
      .status(bodyError ? (error.type === 'entity.too.large' ? 413 : 400) : 503)
      .json({
        error: bodyError
          ? 'Invalid or oversized JSON body.'
          : 'Application security or request handling is temporarily unavailable.',
      });
  };
  app.use(errors);
  return app;
}
