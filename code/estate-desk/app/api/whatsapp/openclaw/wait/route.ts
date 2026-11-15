import { normalisePhone } from '@/lib/domain';
import { openClawRuntime } from '@/lib/openclaw-runtime';
import { database, identity, read, save } from '@/lib/store';

export async function POST(request: Request) {
  try {
    const workspaceId = await identity();
    const body = (await request.json().catch(() => ({}))) as {
      currentQrDataUrl?: string;
      sessionKey?: string;
    };
    const db = database();
    const connection = await db
      .prepare(
        'SELECT runtime_account_id FROM whatsapp_connections WHERE workspace_id=? AND provider=?',
      )
      .bind(workspaceId, 'openclaw')
      .first<{ runtime_account_id: string }>();
    if (!connection?.runtime_account_id)
      throw new Error('Start WhatsApp linking first.');
    const result = await openClawRuntime<{
      connected?: boolean;
      qrDataUrl?: string;
      sessionKey?: string;
      message?: string;
      phone?: string;
    }>('/v1/whatsapp/login/wait', {
      method: 'POST',
      body: JSON.stringify({
        accountId: connection.runtime_account_id,
        currentQrDataUrl: body.currentQrDataUrl,
        sessionKey: body.sessionKey,
      }),
      timeoutMs: 75_000,
    });
    if (!result.connected) return Response.json(result);
    const linkedPhone = normalisePhone(result.phone || '');
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
    return Response.json({ ...result, phone: linkedPhone });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not finish WhatsApp linking.';
    return Response.json(
      { error: message },
      { status: message === 'UNAUTHORIZED' ? 401 : 400 },
    );
  }
}
