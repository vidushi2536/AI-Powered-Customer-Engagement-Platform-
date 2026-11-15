import { normalisePhone } from '@/lib/domain';
import { openClawRuntime } from '@/lib/openclaw-runtime';
import { database, identity, read, save } from '@/lib/store';

export async function GET() {
  try {
    const workspaceId = await identity();
    const db = database();
    const connection = await db
      .prepare(
        'SELECT display_phone,runtime_account_id,agent_id FROM whatsapp_connections WHERE workspace_id=? AND provider=?',
      )
      .bind(workspaceId, 'openclaw')
      .first<{
        display_phone: string | null;
        runtime_account_id: string | null;
        agent_id: string | null;
      }>();
    if (!connection?.runtime_account_id)
      return Response.json({ connected: false, status: 'not-linked' });
    const live = await openClawRuntime<{
      connected?: boolean;
      phone?: string | null;
      [key: string]: unknown;
    }>(
      `/v1/whatsapp/status?accountId=${encodeURIComponent(connection.runtime_account_id)}`,
      { timeoutMs: 20_000 },
    );
    let displayPhone = connection.display_phone;
    if (live.connected) {
      const linkedPhone = normalisePhone(live.phone || displayPhone || '');
      if (!/^\+\d{10,15}$/.test(linkedPhone))
        throw new Error('WhatsApp linked, but its phone number could not be verified.');
      const { state, revision } = await read(workspaceId);
      if (state.ownerPhone && linkedPhone !== normalisePhone(state.ownerPhone))
        throw new Error(
          `The linked number ${linkedPhone} does not match your saved number ${state.ownerPhone}.`,
        );
      const existing = await db
        .prepare('SELECT workspace_id FROM phone_owners WHERE phone=?')
        .bind(linkedPhone)
        .first<{ workspace_id: string }>();
      if (existing && existing.workspace_id !== workspaceId)
        throw new Error('This WhatsApp number is already linked to another workspace.');
      const now = new Date().toISOString();
      state.ownerPhone = linkedPhone;
      state.phone = linkedPhone;
      state.phoneMode = 'google';
      state.onboardingComplete = true;
      state.whatsapp = {
        accountId: connection.runtime_account_id,
        senderPhone: linkedPhone,
        lastEventAt: state.whatsapp?.lastEventAt || null,
        connected: true,
        provider: 'openclaw',
        status: 'connected',
      };
      await save(workspaceId, state, revision);
      await db.batch([
        db
          .prepare(
            'INSERT INTO phone_owners (phone,workspace_id,verified,updated_at) VALUES (?,?,1,?) ON CONFLICT(phone) DO UPDATE SET workspace_id=excluded.workspace_id,verified=1,updated_at=excluded.updated_at',
          )
          .bind(linkedPhone, workspaceId, now),
        db
          .prepare(
            'UPDATE whatsapp_connections SET status=?,display_phone=?,updated_at=? WHERE workspace_id=?',
          )
          .bind('connected', linkedPhone, now, workspaceId),
      ]);
      displayPhone = linkedPhone;
    }
    return Response.json({
      ...live,
      accountId: connection.runtime_account_id,
      agentId: connection.agent_id,
      displayPhone,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not read WhatsApp status.' },
      { status: 400 },
    );
  }
}
