// app/api/campaigns/{id}/contacts/{phone}/matches - GET the current top
// five property matches for this contact (Part 8 / Part 13).

import { env } from 'cloudflare:workers';
import { authenticateCampaignCaller, canAccessCampaign } from '@/lib/campaign-auth';

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; phone: string }> },
) {
  const { id, phone: rawPhone } = await params;
  const phone = decodeURIComponent(rawPhone || '');
  if (!id || !phone) return fail('Missing campaign id or phone');

  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  const caller = await authenticateCampaignCaller(request);
  if (!caller) return fail('Unauthorized', 401);
  if (!(await canAccessCampaign(env.DB, id, caller))) return fail('Unauthorized', 401);

  const { results } = await env.DB
    .prepare(
      `SELECT m.rank, m.score, m.is_hot as isHot, m.match_reasons as matchReasons, m.unmet_requirements as unmetRequirements,
              p.id as propertyId, p.address, p.location, p.price, p.bedrooms, p.size_sqft as sizeSqft, p.property_type as propertyType
       FROM campaign_matches m
       JOIN properties p ON p.id = m.property_id
       WHERE m.campaign_id=? AND m.contact_phone=?
       ORDER BY m.rank ASC
       LIMIT 5`,
    )
    .bind(id, phone)
    .all<Record<string, unknown>>();

  const matches = results.map((row) => ({
    ...row,
    matchReasons: JSON.parse((row.matchReasons as string) || '[]'),
    unmetRequirements: JSON.parse((row.unmetRequirements as string) || '[]'),
  }));

  return Response.json({ matches }, { headers: { 'Cache-Control': 'no-store' } });
}
