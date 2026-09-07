import { allowedPhone, identity, read, save, database, runtime } from '@/lib/store';
import { normalisePhone } from '@/lib/domain';
export async function POST(req: Request) {
  try {
    if (
      req.headers.get('origin') &&
      req.headers.get('origin') !== new URL(req.url).origin
    )
      throw new Error('Origin not allowed');
    const id = await identity();
    const b = await req.json() as Record<string, unknown>;
    const phone = normalisePhone(String(b.phone || ''));
    const allowlistedPhone = allowedPhone();
    if (phone !== allowlistedPhone)
      throw new Error(`This private demo supports only ${allowlistedPhone}.`);
    const db = database(),
      now = Date.now(),
      e = runtime();
    const live = !!(
      e.TWILIO_VERIFY_SERVICE_SID &&
      e.TWILIO_ACCOUNT_SID &&
      e.TWILIO_AUTH_TOKEN
    );
    const challenge = await db
      .prepare('SELECT * FROM phone_challenges WHERE id=?')
      .bind(id)
      .first<{
        phone: string;
        attempts: number;
        expires: number;
        sent_at: number;
      }>();
    async function twilio(path: string, data: Record<string, string>) {
      const r = await fetch(
        `https://verify.twilio.com/v2/Services/${e.TWILIO_VERIFY_SERVICE_SID}/${path}`,
        {
          method: 'POST',
          headers: {
            Authorization:
              'Basic ' + btoa(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(data),
        },
      );
      const j = (await r.json()) as { status: string };
      if (!r.ok)
        throw new Error('SMS verification unavailable. Try again later.');
      return j;
    }
    if (b.action === 'send') {
      if (challenge && now - challenge.sent_at < 60000)
        throw new Error(
          'Please wait one minute before requesting another code.',
        );
      if (live) await twilio('Verifications', { To: phone, Channel: 'sms' });
      await db
        .prepare(
          'INSERT INTO phone_challenges (id,phone,attempts,expires,sent_at) VALUES (?,?,0,?,?) ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,attempts=0,expires=excluded.expires,sent_at=excluded.sent_at',
        )
        .bind(id, phone, now + 300000, now)
        .run();
      return Response.json({
        mode: live ? 'sms' : 'demo',
        message: live
          ? 'Code sent to your phone.'
          : 'Demo only: use 123456. No SMS sent.',
      });
    }
    if (
      b.action !== 'verify' ||
      !challenge ||
      challenge.expires < now ||
      challenge.attempts >= 5 ||
      challenge.phone !== phone
    )
      throw new Error(
        'Code expired or too many attempts. Request another code.',
      );
    await db
      .prepare('UPDATE phone_challenges SET attempts=attempts+1 WHERE id=?')
      .bind(id)
      .run();
    const approved = live
      ? (await twilio('VerificationCheck', { To: phone, Code: String(b.code) }))
          .status === 'approved'
      : b.code === '123456';
    if (!approved) throw new Error('Incorrect code.');
    const { state, revision } = await read(id);
    state.phone = phone;
    state.phoneMode = live ? 'sms' : 'demo';
    state.whatsapp = {
      accountId: 'shellsworth',
      senderPhone: phone,
      lastEventAt: state.whatsapp?.lastEventAt || null,
      connected: state.whatsapp?.connected || false,
    };
    await save(id, state, revision);
    await db
      .prepare(
        'INSERT INTO phone_owners (phone,workspace_id,verified,updated_at) VALUES (?,?,?,?) ON CONFLICT(phone) DO UPDATE SET workspace_id=excluded.workspace_id,verified=excluded.verified,updated_at=excluded.updated_at',
      )
      .bind(phone, id, live ? 1 : 0, new Date().toISOString())
      .run();
    await db.prepare('DELETE FROM phone_challenges WHERE id=?').bind(id).run();
    return Response.json({ ok: true, mode: state.phoneMode });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Verification failed' },
      { status: 400 },
    );
  }
}
