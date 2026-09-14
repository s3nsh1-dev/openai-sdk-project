import { z } from 'zod';
const positive = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);
const environment = z.object({
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
      local: { context: 4096, output: 1024, input: 2816 },
      gemini: { output: 4096, input: 24000 },
    },
  };
}
