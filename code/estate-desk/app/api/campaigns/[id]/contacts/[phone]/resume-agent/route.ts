// app/api/campaigns/{id}/contacts/{phone}/resume-agent - POST
//
// The ONLY way agent_paused is cleared after a human handoff (Part 11: "the
// agent must not resume because of a timeout or new inbound message unless
// the manager has explicitly re-enabled it"). Also resolves any pending
// handoff record for this contact.

import { env } from 'cloudflare:workers';
import { authenticateCampaignCaller, canAccessCampaign } from '@/lib/campaign-auth';

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; phone: string }> },
) {
  const { id: campaignId, phone: rawPhone } = await params;
  const phone = decodeURIComponent(rawPhone || '');
  if (!campaignId || !phone) return fail('Missing campaign id or phone');

  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  const db = env.DB;

  // Resuming after a human handoff is a manager-only action by design (Part
  // 11): the agent must never resume itself, even holding the sync secret.
  const caller = await authenticateCampaignCaller(request);
  if (!caller || caller.kind !== 'manager') return fail('Unauthorized', 401);
  if (!(await canAccessCampaign(db, campaignId, caller))) return fail('Unauthorized', 401);
  const now = new Date().toISOString();

  const contact = await db
    .prepare('SELECT id FROM campaign_contacts WHERE campaign_id=? AND phone=?')
    .bind(campaignId, phone)
    .first<{ id: string }>();
  if (!contact) return fail('Contact not found for this campaign', 404);

  await db.batch([
    db
      .prepare('UPDATE campaign_contacts SET agent_paused=0, status=?, updated_at=? WHERE campaign_id=? AND phone=?')
      .bind('active', now, campaignId, phone),
    db
      .prepare(
        "UPDATE handoffs SET status='resolved', resolved_at=? WHERE campaign_id=? AND phone=? AND status IN ('pending','notified','accepted','in_progress')",
      )
      .bind(now, campaignId, phone),
  ]);

  return Response.json({ ok: true, status: 'active' });
}
