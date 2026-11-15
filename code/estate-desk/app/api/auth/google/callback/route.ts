import { cookieValue, createSession, secureCookie } from '@/lib/auth';
import { database, initial, runtime } from '@/lib/store';

type TokenResponse = { access_token?: string; error?: string };
type GoogleUser = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

function redirect(request: Request, path: string, cookies: string[] = []) {
  const headers = new Headers({
    Location: new URL(path, request.url).toString(),
  });
  cookies.forEach((cookie) => headers.append('Set-Cookie', cookie));
  return new Response(null, { status: 302, headers });
}

function clearOAuthCookies(request: Request) {
  const secure = secureCookie(request);
  return [
    `estate_google_state=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    `estate_google_verifier=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  ];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const savedState = cookieValue(request, 'estate_google_state') || '';
  const verifier = cookieValue(request, 'estate_google_verifier') || '';
  const cleanup = clearOAuthCookies(request);
  if (!code || !state || !savedState || state !== savedState || !verifier)
    return redirect(request, '/?auth_error=invalid_google_response', cleanup);

  try {
    const environment = runtime();
    if (
      !environment.GOOGLE_CLIENT_ID ||
      !environment.GOOGLE_CLIENT_SECRET ||
      !environment.GOOGLE_REDIRECT_URI
    )
      throw new Error('Google sign-in is not configured');

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: environment.GOOGLE_CLIENT_ID,
        client_secret: environment.GOOGLE_CLIENT_SECRET,
        redirect_uri: environment.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
    const token = (await tokenResponse.json()) as TokenResponse;
    if (!tokenResponse.ok || !token.access_token)
      throw new Error(token.error || 'Google token exchange failed');

    const profileResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    const profile = (await profileResponse.json()) as GoogleUser;
    if (
      !profileResponse.ok ||
      !profile.sub ||
      !profile.email ||
      profile.email_verified !== true
    )
      throw new Error('Google account could not be verified');

    const db = database();
    const existing = await db
      .prepare(
        "SELECT workspace_id FROM oauth_identities WHERE provider='google' AND subject=?",
      )
      .bind(profile.sub)
      .first<{ workspace_id: string }>();
    const workspaceId = existing?.workspace_id || crypto.randomUUID();
    const now = new Date().toISOString();
    if (!existing) {
      await db.batch([
        db
          .prepare(
            'INSERT INTO workspaces (id,state,revision,updated_at) VALUES (?,?,0,?)',
          )
          .bind(workspaceId, JSON.stringify(initial()), now),
        db
          .prepare(
            'INSERT INTO oauth_identities (provider,subject,workspace_id,email,name,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
          )
          .bind(
            'google',
            profile.sub,
            workspaceId,
            profile.email.toLowerCase(),
            (profile.name || '').slice(0, 120),
            now,
            now,
          ),
      ]);
    } else {
      await db
        .prepare(
          "UPDATE oauth_identities SET email=?,name=?,updated_at=? WHERE provider='google' AND subject=?",
        )
        .bind(
          profile.email.toLowerCase(),
          (profile.name || '').slice(0, 120),
          now,
          profile.sub,
        )
        .run();
    }

    const sessionCookie = await createSession(request, workspaceId);
    const stateRow = await db
      .prepare('SELECT state FROM workspaces WHERE id=?')
      .bind(workspaceId)
      .first<{ state: string }>();
    const stateValue = stateRow
      ? (JSON.parse(stateRow.state) as { onboardingComplete?: boolean })
      : {};
    return redirect(
      request,
      stateValue.onboardingComplete ? '/dashboard' : '/onboarding',
      [...cleanup, sessionCookie],
    );
  } catch {
    return redirect(request, '/?auth_error=google_sign_in_failed', cleanup);
  }
}
