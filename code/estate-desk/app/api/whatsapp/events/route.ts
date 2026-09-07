import { ingestWhatsApp, normalisePhone } from '@/lib/domain';
import { allowedPhone, database, read, runtime, save } from '@/lib/store';

type IncomingEvent = {
  id?: unknown;
  direction?: unknown;
  channelId?: unknown;
  accountId?: unknown;
  contactPhone?: unknown;
  text?: unknown;
  timestamp?: unknown;
};

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function GET(request: Request) {
  const secret = runtime().WHATSAPP_SYNC_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`)
    return fail('Unauthorized', 401);
  return Response.json({
    ok: true,
    channelId: 'whatsapp',
    accountId: 'shellsworth',
    contactPhone: allowedPhone(),
  });
}

export async function POST(request: Request) {
  const secret = runtime().WHATSAPP_SYNC_SECRET;
  if (!secret) return fail('WhatsApp sync is not configured', 503);
  if (request.headers.get('authorization') !== `Bearer ${secret}`)
    return fail('Unauthorized', 401);
  if (Number(request.headers.get('content-length') || 0) > 16000)
    return fail('Payload too large', 413);

  let body: IncomingEvent;
  try {
    body = (await request.json()) as IncomingEvent;
  } catch {
    return fail('Invalid JSON');
  }
  const id = String(body.id || '').slice(0, 180);
  const direction = body.direction;
  const channelId = String(body.channelId || '');
  const accountId = String(body.accountId || '');
  const contactPhone = normalisePhone(String(body.contactPhone || ''));
  const allowlistedPhone = allowedPhone();
  const text = String(body.text || '').trim();
  const occurredAt = new Date(
    typeof body.timestamp === 'number' || typeof body.timestamp === 'string'
      ? body.timestamp
      : Date.now(),
  );
  if (!id || !['received', 'sent'].includes(String(direction)))
    return fail('Invalid event');
  if (channelId !== 'whatsapp' || accountId !== 'shellsworth')
    return fail('Channel not allowed', 403);
  if (contactPhone !== allowlistedPhone)
    return fail('Contact is not allowlisted', 403);
  if (!text || text.length > 1200) return fail('Message length not allowed');
  if (!Number.isFinite(occurredAt.getTime())) return fail('Invalid timestamp');

  const db = database();
  const duplicate = await db
    .prepare('SELECT id FROM whatsapp_events WHERE id=?')
    .bind(id)
    .first();
  if (duplicate) return Response.json({ ok: true, duplicate: true });
  const owner = await db
    .prepare('SELECT workspace_id FROM phone_owners WHERE phone=?')
    .bind(allowlistedPhone)
    .first<{ workspace_id: string }>();
  if (!owner)
    return fail('Open the dashboard and associate the WhatsApp number first', 409);

  const { state, revision } = await read(owner.workspace_id);
  if (state.messages.some((message) => message.id === id))
    return Response.json({ ok: true, duplicate: true });
  const next = ingestWhatsApp(
    state,
    {
      id,
      direction: direction as 'received' | 'sent',
      text,
      at: occurredAt.toISOString(),
    },
    allowlistedPhone,
  );
  await save(owner.workspace_id, next, revision);
  await db
    .prepare(
      'INSERT OR IGNORE INTO whatsapp_events (id,workspace_id,direction,contact_phone,content,occurred_at,created_at) VALUES (?,?,?,?,?,?,?)',
    )
    .bind(
      id,
      owner.workspace_id,
      direction,
      contactPhone,
      text,
      occurredAt.toISOString(),
      new Date().toISOString(),
    )
    .run();
  return Response.json({ ok: true, status: next.status });
}
