import { runtime } from './store';

type RuntimeRequest = RequestInit & { timeoutMs?: number };

export async function openClawRuntime<T>(
  path: string,
  options: RuntimeRequest = {},
): Promise<T> {
  const configuredUrl = runtime().ESTATE_DESK_RUNTIME_URL;
  const secret = runtime().ESTATE_DESK_RUNTIME_SECRET;
  if (!configuredUrl || !secret)
    throw new Error('The Estate Desk WhatsApp runtime is not configured.');
  const baseUrl = new URL(configuredUrl);
  if (
    baseUrl.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(baseUrl.hostname)
  )
    throw new Error('Local WhatsApp runtime URL is not trusted.');
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 70_000,
  );
  try {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${secret}`);
    if (!headers.has('Content-Type'))
      headers.set('Content-Type', 'application/json');
    const { timeoutMs: _timeoutMs, ...requestOptions } = options;
    const response = await fetch(new URL(path, baseUrl), {
      ...requestOptions,
      headers,
      signal: controller.signal,
    });
    const result = (await response.json().catch(() => ({}))) as T & {
      error?: string;
    };
    if (!response.ok)
      throw new Error(result.error || 'The WhatsApp runtime request failed.');
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error(
        'The WhatsApp connection service did not respond. Please try again.',
      );
    if (error instanceof TypeError)
      throw new Error(
        'The WhatsApp connection service is offline. Start Estate Desk services and try again.',
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
