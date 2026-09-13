// app/api/campaigns/[id]/messages/route.ts
//
// GET  /api/campaigns/{id}/messages?phone=+1555...   - full raw transcript
// POST /api/campaigns/{id}/messages                  - record one message
//
// This is the idempotent message-ingestion endpoint from Part 5 (inbound)
// and the outbound send-authorization checkpoint from Part 4 (outbound).
// All the D1 work lives in lib/campaign-pipeline.ts so a future dedicated
// /api/whatsapp/webhook route can share the exact same logic.

import { env } from 'cloudflare:workers';
import { recordInboundMessage, recordOutboundMessage } from '@/lib/campaign-pipeline';
import { OutboundNotAllowedError } from '@/lib/messaging';
import { authenticateCampaignCaller, canAccessCampaign } from '@/lib/campaign-auth';

function fail(message: string, status = 400, code?: string) {
  return Response.json({ error: message, code }, { status });
}

function db() {
  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  return env.DB;
}

async function requireAccess(request: Request, campaignId: string) {
  const caller = await authenticateCampaignCaller(request);
  if (!caller) return fail('Unauthorized', 401);
  if (!(await canAccessCampaign(db(), campaignId, caller))) return fail('Unauthorized', 401);
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return fail('Missing campaign id or phone');
  const denied = await requireAccess(request, id);
  if (denied) return denied;

  const phone = new URL(request.url).searchParams.get('phone');
  if (!phone) return fail('Missing campaign id or phone');

  const { results } = await db()
    .prepare(
      'SELECT id, direction, body, occurred_at as occurredAt, delivery_status as deliveryStatus FROM campaign_messages WHERE campaign_id=? AND contact_phone=? ORDER BY occurred_at ASC, created_at ASC',
    )
    .bind(id, phone)
    .all();

  return Response.json({ messages: results }, { headers: { 'Cache-Control': 'no-store' } });
}

type MessageBody = {
  phone?: unknown;
  direction?: unknown;
  body?: unknown;
  providerMessageId?: unknown;
  occurredAt?: unknown;
  rawPayload?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (Number(request.headers.get('content-length') || 0) > 20000) return fail('Payload too large', 413);

  const { id: campaignId } = await params;
  if (!campaignId) return fail('Missing campaign id');
  const denied = await requireAccess(request, campaignId);
  if (denied) return denied;

  let body: MessageBody;
  try {
    body = (await request.json()) as MessageBody;
  } catch {
    return fail('Invalid JSON');
  }

  const phone = String(body.phone || '');
  const direction = body.direction;
  const text = String(body.body || '').trim();
  const providerMessageId = body.providerMessageId ? String(body.providerMessageId).slice(0, 180) : null;
  const occurredAt =
    typeof body.occurredAt === 'string' || typeof body.occurredAt === 'number'
      ? new Date(body.occurredAt).toISOString()
      : undefined;
  const rawPayload = body.rawPayload !== undefined ? JSON.stringify(body.rawPayload) : null;

  if (!phone) return fail('phone is required');
  if (!text || text.length > 4000) return fail('body must be 1-4000 characters');
  if (direction !== 'inbound' && direction !== 'outbound') return fail('direction must be inbound or outbound');

  try {
    if (direction === 'inbound') {
      const result = await recordInboundMessage(db(), {
        campaignId,
        phone,
        body: text,
        providerMessageId,
        occurredAt,
        rawPayload,
      });
      return Response.json({ ok: true, ...result });
    }

    const result = await recordOutboundMessage(db(), {
      campaignId,
      phone,
      body: text,
      providerMessageId,
      occurredAt,
      rawPayload,
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof OutboundNotAllowedError) return fail(e.message, 403, e.code);
    if (e instanceof Error && e.message === 'CONTACT_NOT_ALLOWED')
      return fail('Sender is not on this campaign\'s allowlist.', 403, 'CONTACT_NOT_ALLOWED');
    return fail(e instanceof Error ? e.message : 'Request failed', 500);
  }
}
