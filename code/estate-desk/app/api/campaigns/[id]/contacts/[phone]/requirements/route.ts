// app/api/campaigns/{id}/contacts/{phone}/requirements - GET the latest
// *valid* structured extraction for this contact (Part 7 / Part 13).

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

  const row = await env.DB
    .prepare('SELECT * FROM campaign_requirements WHERE campaign_id=? AND contact_phone=?')
    .bind(id, phone)
    .first<Record<string, unknown>>();

  if (!row) return Response.json({ requirements: null });

  const jsonFields = [
    'preferred_locations',
    'required_features',
    'preferred_features',
    'missing_fields',
    'confidence',
    'source_message_ids',
  ];
  const parsed: Record<string, unknown> = { ...row };
  for (const field of jsonFields) {
    if (typeof parsed[field] === 'string') {
      try {
        parsed[field] = JSON.parse(parsed[field] as string);
      } catch {
        // leave as raw string if it somehow isn't valid JSON
      }
    }
  }

  return Response.json({ requirements: parsed }, { headers: { 'Cache-Control': 'no-store' } });
}
