import OpenAI from 'openai';
import { StreamFailure } from './normalize';
export function safeError(error: unknown): { code: string; message: string } {
  if (error instanceof StreamFailure)
    return { code: error.code, message: error.message };
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429)
      return {
        code: 'quota',
        message:
          'The provider is rate limited or out of quota. Wait and retry explicitly.',
      };
    if (error.status === 401 || error.status === 403)
      return {
        code: 'credentials',
        message:
          'Provider credentials were rejected. Check the server configuration.',
      };
    if (error.status === 404)
      return {
        code: 'model_unavailable',
        message:
          'The selected model or endpoint is unavailable. Check the server configuration and installed models.',
      };
  }
  if (error instanceof SyntaxError)
    return {
      code: 'malformed_stream',
      message:
        'The provider sent malformed stream data. Check provider compatibility.',
    };
  return {
    code: 'provider_unavailable',
    message:
      'The provider connection failed. Check that the provider is reachable, then retry explicitly.',
  };
}
