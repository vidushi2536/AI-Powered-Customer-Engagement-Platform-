// app/api/campaigns/[id]/contacts/route.ts
//
// GET /api/campaigns/{id}/contacts - the allowlist endpoint the OpenClaw
// agent polls to know which numbers it may contact for a campaign. Also
// readable from the manager dashboard session.

import { env } from 'cloudflare:workers';
import { authenticateCampaignCaller, canAccessCampaign } from '@/lib/campaign-auth';

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await authenticateCampaignCaller(request);
  if (!caller) return fail('Unauthorized', 401);

  const { id } = await params;
  if (!id) return fail('Missing campaign id');

  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  if (!(await canAccessCampaign(env.DB, id, caller))) return fail('Unauthorized', 401);

  const { results } = await env.DB.prepare(
    'SELECT phone, status FROM campaign_contacts WHERE campaign_id=?',
  )
    .bind(id)
    .all<{ phone: string; status: string }>();

  return Response.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
