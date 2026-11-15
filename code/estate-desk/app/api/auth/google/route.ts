import { randomToken, secureCookie } from '@/lib/auth';
import { runtime } from '@/lib/store';

function base64Url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export async function GET(request: Request) {
  const environment = runtime();
  const clientId = environment.GOOGLE_CLIENT_ID;
  const redirectUri = environment.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri)
    return Response.json(
      { error: 'Google sign-in is not configured.' },
      { status: 503 },
    );

  const state = randomToken();
  const verifier = randomToken(48);
  const challenge = base64Url(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  );
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorization.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();

  const headers = new Headers({ Location: authorization.toString() });
  const secure = secureCookie(request);
  headers.append(
    'Set-Cookie',
    `estate_google_state=${state}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
  );
  headers.append(
    'Set-Cookie',
    `estate_google_verifier=${verifier}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
  );
  return new Response(null, { status: 302, headers });
}
