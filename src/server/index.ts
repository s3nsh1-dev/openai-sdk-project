import { createApp } from './app';
import { loadConfig } from './config';
const config = loadConfig();
createApp(config).listen(config.PORT, '127.0.0.1', () => {
  console.info(`Chat lab: http://127.0.0.1:${config.PORT}`);
});
