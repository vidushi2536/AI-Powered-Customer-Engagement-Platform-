import { openClawRuntime } from '@/lib/openclaw-runtime';
import { database, hashToken, identity, read } from '@/lib/store';

type LoginResult = {
  qrDataUrl?: string;
  sessionKey?: string;
  connected?: boolean;
  message?: string;
};

function transientLoginFailure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /internal error|reference\s*=|gateway request failed|timed out/i.test(
    message,
  );
}

async function startLogin(accountId: string) {
  const request = () =>
    openClawRuntime<LoginResult>('/v1/whatsapp/login/start', {
      method: 'POST',
      body: JSON.stringify({ accountId }),
      timeoutMs: 90_000,
    });
  try {
    return await request();
  } catch (error) {
    // OpenClaw can briefly reject a new QR request while retiring a stale
    // WhatsApp socket. One retry turns that reconnect race into a fresh QR.
    if (!transientLoginFailure(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    try {
      return await request();
    } catch (retryError) {
      if (!transientLoginFailure(retryError)) throw retryError;
      throw new Error(
        'WhatsApp is still closing the previous connection. Wait a few seconds, then select Connect WhatsApp again.',
      );
    }
  }
}

export async function POST() {
  try {
    const workspaceId = await identity();
    const { state } = await read(workspaceId);
    if (!state.ownerPhone || !state.contacts?.length)
      throw new Error('Save your WhatsApp number and contacts first.');
    const db = database();
    const existing = await db
      .prepare(
        'SELECT runtime_account_id,agent_id FROM whatsapp_connections WHERE workspace_id=? AND provider=?',
      )
      .bind(workspaceId, 'openclaw')
      .first<{ runtime_account_id: string | null; agent_id: string | null }>();
    let provisioned: {
      accountId: string;
      agentId: string;
    };
    if (existing?.runtime_account_id) {
      provisioned = {
        accountId: existing.runtime_account_id,
        agentId: existing.agent_id || existing.runtime_account_id,
      };
    } else {
      const syncToken = crypto.randomUUID() + crypto.randomUUID();
      provisioned = await openClawRuntime<{
        accountId: string;
        agentId: string;
      }>('/v1/provision', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, syncToken }),
      });
      const now = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO whatsapp_connections
        (workspace_id,provider,status,display_phone,runtime_account_id,agent_id,sync_token_hash,waba_id,phone_number_id,access_token,token_iv,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,NULL,NULL,NULL,NULL,?,?)
        ON CONFLICT(workspace_id) DO UPDATE SET provider=excluded.provider,status=excluded.status,display_phone=excluded.display_phone,runtime_account_id=excluded.runtime_account_id,agent_id=excluded.agent_id,sync_token_hash=excluded.sync_token_hash,waba_id=NULL,phone_number_id=NULL,access_token=NULL,token_iv=NULL,updated_at=excluded.updated_at`,
        )
        .bind(
          workspaceId,
          'openclaw',
          'linking',
          state.ownerPhone,
          provisioned.accountId,
          provisioned.agentId,
          await hashToken(syncToken),
          now,
          now,
        )
        .run();
      await openClawRuntime('/v1/context/sync', {
        method: 'POST',
        body: JSON.stringify({ accountId: provisioned.accountId }),
      });
    }
    // Context sync finalises the CRM allowlist and restarts the WhatsApp
    // channel. Start login only after that restart so the displayed QR cannot
    // be invalidated by a late configuration reload.
    const login = await startLogin(provisioned.accountId);
    if (login.connected) {
      await db
        .prepare(
          'UPDATE whatsapp_connections SET status=?, updated_at=? WHERE workspace_id=?',
        )
        .bind('connected', new Date().toISOString(), workspaceId)
        .run();
    }
    return Response.json({ ...login, ...provisioned });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start WhatsApp linking.';
    return Response.json(
      { error: message },
      { status: message === 'UNAUTHORIZED' ? 401 : 400 },
    );
  }
}
