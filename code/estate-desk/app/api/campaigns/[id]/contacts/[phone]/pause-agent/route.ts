// app/api/campaigns/{id}/contacts/{phone}/pause-agent - POST
//
// Lets a manager pause automated replies for a contact directly (e.g. "I'll
// text them myself for now") without going through the full handoff-request
// flow. Complements resume-agent.

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

  const caller = await authenticateCampaignCaller(request);
  if (!caller) return fail('Unauthorized', 401);
  if (!(await canAccessCampaign(db, campaignId, caller))) return fail('Unauthorized', 401);

  const contact = await db
    .prepare('SELECT id FROM campaign_contacts WHERE campaign_id=? AND phone=?')
    .bind(campaignId, phone)
    .first<{ id: string }>();
  if (!contact) return fail('Contact not found for this campaign', 404);

  await db
    .prepare('UPDATE campaign_contacts SET agent_paused=1, updated_at=? WHERE campaign_id=? AND phone=?')
    .bind(new Date().toISOString(), campaignId, phone)
    .run();

  return Response.json({ ok: true, status: 'paused' });
}
