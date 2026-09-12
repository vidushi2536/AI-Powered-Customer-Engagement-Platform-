// app/api/campaigns/[id]/contacts/route.ts
//
// GET /api/campaigns/{id}/contacts — the allowlist endpoint the OpenClaw
// agent polls to know which numbers it may contact for a campaign.

import { env } from 'cloudflare:workers';

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const secret = (env as unknown as Record<string, string | undefined>)
    .CAMPAIGN_SYNC_SECRET;
  if (!secret) return fail('Campaign sync is not configured', 503);
  if (request.headers.get('authorization') !== `Bearer ${secret}`)
    return fail('Unauthorized', 401);

  const { id } = await params;
  if (!id) return fail('Missing campaign id');

  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');

  const { results } = await env.DB.prepare(
    'SELECT phone, status FROM campaign_contacts WHERE campaign_id=?',
  )
    .bind(id)
    .all<{ phone: string; status: string }>();

  return Response.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  });
}