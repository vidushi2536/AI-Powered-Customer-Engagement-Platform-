// lib/campaign-auth.ts
//
// The campaign routes originally shipped with only a shared bearer secret
// (`CAMPAIGN_SYNC_SECRET`), intended for server-to-server OpenClaw agent
// calls - see the "TODO: replace with real dashboard auth once lib/store.ts
// ... is available" comments the original authors left in those routes.
// Now that lib/store.ts's `identity()` exists, manager-facing reads accept
// EITHER an authenticated ChatGPT dashboard session OR the sync secret, so
// the browser dashboard can call the same endpoints the agent uses without
// ever holding the shared secret client-side.

import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';

export type CampaignCaller = { kind: 'manager'; userId: string } | { kind: 'agent' };

function syncSecret(): string | undefined {
  return (env as unknown as Record<string, string | undefined>).CAMPAIGN_SYNC_SECRET;
}

/**
 * Returns the authenticated caller, or null if neither a dashboard session
 * nor a valid sync secret is present. Callers should treat null as a 401.
 * If `CAMPAIGN_SYNC_SECRET` isn't configured at all, agent-style bearer
 * auth is simply unavailable - the dashboard session path still works.
 */
export async function authenticateCampaignCaller(
  request: Request,
): Promise<CampaignCaller | null> {
  const secret = syncSecret();
  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) {
    return { kind: 'agent' };
  }

  const user = await getChatGPTUser();
  if (user) return { kind: 'manager', userId: user.userId };

  return null;
}

/**
 * A manager may only act on campaigns owned by their own workspace; an
 * agent (sync-secret) caller is trusted server-to-server and may act on
 * any campaign id it's given. Returns true if access is allowed.
 */
export async function canAccessCampaign(
  db: D1Database,
  campaignId: string,
  caller: CampaignCaller,
): Promise<boolean> {
  if (caller.kind === 'agent') return true;
  const row = await db
    .prepare('SELECT workspace_id FROM campaigns WHERE id=?')
    .bind(campaignId)
    .first<{ workspace_id: string }>();
  return !!row && row.workspace_id === `user:${caller.userId}`;
}
