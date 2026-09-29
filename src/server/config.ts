import { z } from 'zod';
const positive = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const environment = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    ACCESS_MODE: z.enum(['local', 'protected']).default('local'),
    AUTH_USERNAME: z.string().default(''),
    AUTH_PASSWORD: z.string().default(''),
    PUBLIC_ORIGIN: z.string().default(''),
    SECURITY_STATE_PATH: z.string().min(1).default('.local/security.sqlite'),
    PORT: positive(3001),
    OLLAMA_BASE_URL: z
      .url()
      .refine((url) => ['http:', 'https:'].includes(new URL(url).protocol))
      .default('http://127.0.0.1:11434/v1'),
    OLLAMA_MODEL: z.string().min(1).default('qwen3.5:4b'),
    GEMINI_API_KEY: z.string().default(''),
    GEMINI_MODEL: z.string().min(1).default('gemini-3.8-flash'),
    FIRST_ACTIVITY_MS: positive(120000),
    IDLE_MS: positive(60000),
    OVERALL_MS: positive(300000),
    RATE_LIMIT: positive(10),
    HTTP_RATE_LIMIT: positive(120),
    AUTH_FAILURE_LIMIT: positive(20),
    DAILY_TOKEN_LIMIT: positive(100000),
  })
  .superRefine((config, context) => {
    const reject = (field: string, message: string) =>
      context.addIssue({ code: 'custom', path: [field], message });
    if (config.NODE_ENV === 'production' && config.ACCESS_MODE !== 'protected')
      reject('ACCESS_MODE', 'Production requires protected access.');
    if (
      config.NODE_ENV === 'production' &&
      config.SECURITY_STATE_PATH === ':memory:'
    )
      reject(
        'SECURITY_STATE_PATH',
        'Production requires persistent security state.',
      );
    if (config.ACCESS_MODE !== 'protected') return;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(config.AUTH_USERNAME))
      reject(
        'AUTH_USERNAME',
        'Set a username with 1–64 letters, numbers, underscores, or hyphens.',
      );
    if (!/^[\x21-\x7e]{32,256}$/.test(config.AUTH_PASSWORD))
      reject(
        'AUTH_PASSWORD',
        'Set a random password with 32–256 printable non-space ASCII characters.',
      );
    try {
      const origin = new URL(config.PUBLIC_ORIGIN);
      if (
        origin.origin !== config.PUBLIC_ORIGIN ||
        origin.username ||
        origin.password
      )
        throw new Error('Not an exact origin');
      if (
        origin.protocol !== 'https:' &&
        !(
          config.NODE_ENV !== 'production' &&
          origin.protocol === 'http:' &&
          loopbackHosts.has(origin.hostname)
        )
      )
        throw new Error('HTTPS required');
    } catch {
      reject(
        'PUBLIC_ORIGIN',
        'Set an exact HTTPS origin without credentials, path, query, or trailing slash. HTTP loopback is allowed only outside production.',
      );
    }
  });
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
) {
  return environment.parse(env);
}
export type Config = ReturnType<typeof loadConfig>;
export function publicConfig(config: Config) {
  return {
    providers: {
      local: { name: 'Local', model: config.OLLAMA_MODEL, available: true },
      gemini: {
        name: 'Gemini',
        model: config.GEMINI_MODEL,
        available: Boolean(config.GEMINI_API_KEY.trim()),
      },
    },
    limits: {
      local: { context: 4096, output: 3840, input: 2816 },
      gemini: { output: 4096, input: 24000 },
    },
  };
}
