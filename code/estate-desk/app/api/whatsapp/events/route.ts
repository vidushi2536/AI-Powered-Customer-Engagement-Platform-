import { ingestWhatsApp, normalisePhone } from '@/lib/domain';
import { database, read, runtime, save } from '@/lib/store';

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

function textValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

export async function GET(request: Request) {
  const secret = runtime().WHATSAPP_SYNC_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`)
    return fail('Unauthorized', 401);
  const count = await database()
    .prepare(
      "SELECT COUNT(*) AS count FROM workspace_contacts WHERE consent!='opted-out'",
    )
    .first<{ count: number }>();
  return Response.json({
    ok: true,
    channelId: 'whatsapp',
    accountId: 'shellsworth',
    crmContacts: count?.count || 0,
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
  const id = textValue(body.id).slice(0, 180);
  const direction = body.direction;
  const channelId = textValue(body.channelId);
  const accountId = textValue(body.accountId);
  const contactPhone = normalisePhone(textValue(body.contactPhone));
  const text = textValue(body.text).trim();
  const occurredAt = new Date(
    typeof body.timestamp === 'number' || typeof body.timestamp === 'string'
      ? body.timestamp
      : Date.now(),
  );
  if (!id || !['received', 'sent'].includes(String(direction)))
    return fail('Invalid event');
  if (channelId !== 'whatsapp' || accountId !== 'shellsworth')
    return fail('Channel not allowed', 403);
  if (!/^\+\d{10,15}$/.test(contactPhone)) return fail('Invalid contact', 403);
  if (!text || text.length > 1200) return fail('Message length not allowed');
  if (!Number.isFinite(occurredAt.getTime())) return fail('Invalid timestamp');

  const db = database();
  const duplicate = await db
    .prepare('SELECT id FROM whatsapp_events WHERE id=?')
    .bind(id)
    .first();
  if (duplicate) return Response.json({ ok: true, duplicate: true });
  const owner = await db
    .prepare(
      'SELECT workspace_id,consent FROM workspace_contacts WHERE phone=?',
    )
    .bind(contactPhone)
    .first<{ workspace_id: string; consent: string }>();
  if (!owner) return fail('Contact is not in an onboarded CRM', 403);
  if (owner.consent === 'opted-out' && direction === 'sent')
    return fail('Contact has opted out', 403);

  const { state, revision } = await read(owner.workspace_id);
  if (state.messages.some((message) => message.id === id))
    return Response.json({ ok: true, duplicate: true });
  const lead = state.leads?.find((item) => item.phone === contactPhone);
  if (
    direction === 'sent' &&
    owner.consent === 'inbound-only' &&
    !lead?.messages.some((message) => message.role === 'buyer')
  )
    return fail('Cold outreach is not allowed for this contact', 403);
  const next = ingestWhatsApp(
    state,
    {
      id,
      direction: direction as 'received' | 'sent',
      text,
      at: occurredAt.toISOString(),
    },
    contactPhone,
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
  const updatedContact = next.contacts?.find(
    (item) => item.phone === contactPhone,
  );
  if (updatedContact?.consent !== owner.consent)
    await db
      .prepare(
        'UPDATE workspace_contacts SET consent=? WHERE phone=? AND workspace_id=?',
      )
      .bind(updatedContact?.consent, contactPhone, owner.workspace_id)
      .run();
  return Response.json({ ok: true, status: next.status });
}
