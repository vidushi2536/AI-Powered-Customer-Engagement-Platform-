// app/api/campaigns/{id}/handoffs - GET the handoff queue for a campaign
// (Part 12E). Manager-dashboard-facing; also readable by the sync secret
// for symmetry with the other list endpoints.

import { env } from 'cloudflare:workers';
import { authenticateCampaignCaller, canAccessCampaign } from '@/lib/campaign-auth';

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return fail('Missing campaign id');

  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  const caller = await authenticateCampaignCaller(request);
  if (!caller) return fail('Unauthorized', 401);
  if (!(await canAccessCampaign(env.DB, id, caller))) return fail('Unauthorized', 401);

  const { results } = await env.DB
    .prepare(
      `SELECT h.id, h.phone, h.reason, h.status, h.created_at as createdAt, h.acknowledged_at as acknowledgedAt,
              h.assigned_manager_id as assignedManagerId, h.manager_notes as managerNotes, h.resolved_at as resolvedAt,
              c.display_name as displayName
       FROM handoffs h
       LEFT JOIN campaign_contacts c ON c.campaign_id = h.campaign_id AND c.phone = h.phone
       WHERE h.campaign_id=?
       ORDER BY h.created_at DESC`,
    )
    .bind(id)
    .all();

  return Response.json({ handoffs: results }, { headers: { 'Cache-Control': 'no-store' } });
}
