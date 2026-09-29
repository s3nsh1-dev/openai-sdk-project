import OpenAI from 'openai';
import { StreamFailure } from './normalize';
export function providerStatus(error: unknown): number | undefined {
  if (!(error instanceof OpenAI.APIError)) return;
  // Google can put an HTTP-like numeric code in an error event after HTTP 200.
  const detail = error.error;
  const status =
    error.status ??
    (detail && typeof detail === 'object' && 'code' in detail
      ? detail.code
      : undefined);
  return typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599
    ? status
    : undefined;
}
export function safeError(error: unknown): { code: string; message: string } {
  if (error instanceof StreamFailure)
    return { code: error.code, message: error.message };
  if (error instanceof OpenAI.APIError) {
    const status = providerStatus(error);
    if (status === 429)
      return {
        code: 'quota',
        message:
          'The provider is rate limited or out of quota. Wait and retry explicitly.',
      };
    if (status === 401 || status === 403)
      return {
        code: 'credentials',
        message:
          'Provider credentials were rejected. Check the server configuration.',
      };
    if (status === 404)
      return {
        code: 'model_unavailable',
        message:
          'The selected model or endpoint is unavailable. Check the server configuration and installed models.',
      };
    if (status === 400 || status === 422)
      return {
        code: 'provider_request',
        message: `The provider rejected the request (HTTP ${status}). Check the selected model and supported settings.`,
      };
    if (status && status >= 500)
      return {
        code: 'provider_unavailable',
        message: `The provider is temporarily unavailable (HTTP ${status}). Wait a moment, then retry explicitly.`,
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
