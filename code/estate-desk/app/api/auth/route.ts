import { database, hashToken, initial, runtime } from '@/lib/store';
import { normalisePhone } from '@/lib/domain';

const SESSION_DAYS = 30;

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function textValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function phoneFrom(value: unknown) {
  const phone = normalisePhone(textValue(value));
  if (!/^\+\d{10,15}$/.test(phone))
    throw new Error('Enter a valid phone number with country code.');
  return phone;
}

function cookieValue(request: Request) {
  return (request.headers.get('cookie') || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('estate_session='))
    ?.slice('estate_session='.length);
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

async function twilio(path: string, data: Record<string, string>) {
  const environment = runtime();
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${environment.TWILIO_VERIFY_SERVICE_SID}/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          btoa(
            `${environment.TWILIO_ACCOUNT_SID}:${environment.TWILIO_AUTH_TOKEN}`,
          ),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(data),
    },
  );
  const result = (await response.json()) as { status?: string };
  if (!response.ok)
    throw new Error('SMS verification is unavailable. Try again later.');
  return result;
}

export async function GET(request: Request) {
  const token = cookieValue(request);
  if (!token) return Response.json({ authenticated: false });
  const session = await database()
    .prepare(
      'SELECT s.workspace_id,p.phone FROM app_sessions s LEFT JOIN phone_owners p ON p.workspace_id=s.workspace_id WHERE s.token_hash=? AND s.expires>?',
    )
    .bind(await hashToken(decodeURIComponent(token)), Date.now())
    .first<{ workspace_id: string; phone: string | null }>();
  if (!session) return Response.json({ authenticated: false });
  const row = await database()
    .prepare('SELECT state FROM workspaces WHERE id=?')
    .bind(session.workspace_id)
    .first<{ state: string }>();
  const state = row
    ? (JSON.parse(row.state) as { onboardingComplete?: boolean })
    : {};
  return Response.json({
    authenticated: true,
    phone: session.phone,
    onboardingComplete: state.onboardingComplete === true,
  });
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return fail('Origin not allowed', 403);
    if (Number(request.headers.get('content-length') || 0) > 4000)
      return fail('Request too large', 413);
    const body = (await request.json()) as Record<string, unknown>;
    const phone = phoneFrom(body.phone);
    const challengeId = `auth:${phone}`;
    const db = database();
    const environment = runtime();
    const live = !!(
      environment.TWILIO_VERIFY_SERVICE_SID &&
      environment.TWILIO_ACCOUNT_SID &&
      environment.TWILIO_AUTH_TOKEN
    );
    const now = Date.now();
    const challenge = await db
      .prepare(
        'SELECT phone,attempts,expires,sent_at FROM phone_challenges WHERE id=?',
      )
      .bind(challengeId)
      .first<{
        phone: string;
        attempts: number;
        expires: number;
        sent_at: number;
      }>();

    if (body.action === 'send') {
      if (challenge && now - challenge.sent_at < 60000)
        throw new Error(
          'Please wait one minute before requesting another code.',
        );
      if (live) await twilio('Verifications', { To: phone, Channel: 'sms' });
      await db
        .prepare(
          'INSERT INTO phone_challenges (id,phone,attempts,expires,sent_at) VALUES (?,?,0,?,?) ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,attempts=0,expires=excluded.expires,sent_at=excluded.sent_at',
        )
        .bind(challengeId, phone, now + 300000, now)
        .run();
      return Response.json({
        mode: live ? 'sms' : 'demo',
        message: live ? 'Code sent.' : 'Demo mode: use 123456.',
      });
    }

    if (
      body.action !== 'verify' ||
      !challenge ||
      challenge.phone !== phone ||
      challenge.expires < now ||
      challenge.attempts >= 5
    )
      throw new Error('Code expired. Request another code.');
    await db
      .prepare('UPDATE phone_challenges SET attempts=attempts+1 WHERE id=?')
      .bind(challengeId)
      .run();
    const approved = live
      ? (
          await twilio('VerificationCheck', {
            To: phone,
            Code: textValue(body.code),
          })
        ).status === 'approved'
      : body.code === '123456';
    if (!approved) throw new Error('Incorrect verification code.');

    const owner = await db
      .prepare('SELECT workspace_id FROM phone_owners WHERE phone=?')
      .bind(phone)
      .first<{ workspace_id: string }>();
    const workspaceId = owner?.workspace_id || crypto.randomUUID();
    if (!owner) {
      const state = initial();
      state.ownerPhone = phone;
      state.phone = phone;
      state.phoneMode = live ? 'sms' : 'demo';
      await db.batch([
        db
          .prepare(
            'INSERT INTO workspaces (id,state,revision,updated_at) VALUES (?,?,0,?)',
          )
          .bind(workspaceId, JSON.stringify(state), new Date().toISOString()),
        db
          .prepare(
            'INSERT INTO phone_owners (phone,workspace_id,verified,updated_at) VALUES (?,?,?,?)',
          )
          .bind(phone, workspaceId, live ? 1 : 0, new Date().toISOString()),
      ]);
    }

    const token = randomToken();
    const expires = now + SESSION_DAYS * 86400000;
    await db.batch([
      db.prepare('DELETE FROM app_sessions WHERE expires<=?').bind(now),
      db
        .prepare(
          'INSERT INTO app_sessions (token_hash,workspace_id,expires,created_at) VALUES (?,?,?,?)',
        )
        .bind(
          await hashToken(token),
          workspaceId,
          expires,
          new Date().toISOString(),
        ),
      db.prepare('DELETE FROM phone_challenges WHERE id=?').bind(challengeId),
    ]);
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
    return Response.json(
      { ok: true, onboardingComplete: false },
      {
        headers: {
          'Set-Cookie': `estate_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`,
        },
      },
    );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : 'Authentication failed',
    );
  }
}

export async function DELETE(request: Request) {
  const token = cookieValue(request);
  if (token)
    await database()
      .prepare('DELETE FROM app_sessions WHERE token_hash=?')
      .bind(await hashToken(decodeURIComponent(token)))
      .run();
  return Response.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie':
          'estate_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      },
    },
  );
}
