// app/api/leads/[phone]/handoff/route.ts
//
// POST /api/leads/{phone}/handoff — called by the OpenClaw agent once the
// customer says they'd rather talk to a human.

import { env } from 'cloudflare:workers';
import { newId } from '@/lib/campaigns';

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

type HandoffBody = {
  campaignId?: unknown;
  reason?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ phone: string }> },
) {
  const secret = (env as unknown as Record<string, string | undefined>)
    .CAMPAIGN_SYNC_SECRET;
  if (!secret) return fail('Campaign sync is not configured', 503);
  if (request.headers.get('authorization') !== `Bearer ${secret}`)
    return fail('Unauthorized', 401);

  const { phone: rawPhone } = await params;
  const phone = decodeURIComponent(rawPhone || '');
  if (!phone) return fail('Missing phone');

  let body: HandoffBody;
  try {
    body = (await request.json()) as HandoffBody;
  } catch {
    return fail('Invalid JSON');
  }

  const campaignId = String(body.campaignId || '').trim();
  if (!campaignId) return fail('campaignId is required');
  const reason = String(body.reason || '').slice(0, 500);

  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  const db = env.DB;

  const contact = await db
    .prepare(
      'SELECT id FROM campaign_contacts WHERE campaign_id=? AND phone=?',
    )
    .bind(campaignId, phone)
    .first<{ id: string }>();

  if (!contact) return fail('Contact not found for this campaign', 404);

  const now = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        'UPDATE campaign_contacts SET status=?, updated_at=? WHERE id=?',
      )
      .bind('handed_off', now, contact.id),
    db
      .prepare(
        'INSERT INTO handoffs (id, campaign_id, phone, reason, status, created_at, acknowledged_at) VALUES (?,?,?,?,?,?,?)',
      )
      .bind(newId('handoff'), campaignId, phone, reason, 'pending', now, null),
  ]);

  // TODO once B6/B7 exist: trigger the structuring job for this phone here,
  // then the matching job, then the manager alert (dashboard push / email /
  // WhatsApp — decide channel with Person A).

  return Response.json({ ok: true, status: 'handed_off' });
}