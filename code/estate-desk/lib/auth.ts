import { database, hashToken } from './store';

export const SESSION_DAYS = 30;

export function cookieValue(request: Request, name = 'estate_session') {
  return (request.headers.get('cookie') || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function randomToken(bytesLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesLength));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export function secureCookie(request: Request) {
  return new URL(request.url).protocol === 'https:' ? '; Secure' : '';
}

export async function createSession(request: Request, workspaceId: string) {
  const token = randomToken();
  const now = Date.now();
  const expires = now + SESSION_DAYS * 86400000;
  await database().batch([
    database().prepare('DELETE FROM app_sessions WHERE expires<=?').bind(now),
    database()
      .prepare(
        'INSERT INTO app_sessions (token_hash,workspace_id,expires,created_at) VALUES (?,?,?,?)',
      )
      .bind(
        await hashToken(token),
        workspaceId,
        expires,
        new Date().toISOString(),
      ),
  ]);
  return `estate_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secureCookie(request)}`;
}
