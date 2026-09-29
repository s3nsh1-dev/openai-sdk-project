import { loadConfig as loadServerConfig } from '../../src/server/config';
// Every test app gets independent quota state unless a persistence test supplies a path.
export function loadConfig(env: Record<string, string | undefined> = {}) {
  return loadServerConfig({ SECURITY_STATE_PATH: ':memory:', ...env });
}
export { publicConfig } from '../../src/server/config';
