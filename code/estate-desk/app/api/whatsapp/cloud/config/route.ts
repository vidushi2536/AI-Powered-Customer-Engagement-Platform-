import {
  connectionForWorkspace,
  encryptAccessToken,
  graphVersion,
} from '@/lib/cloud-whatsapp';
import { database, identity, read, runtime, save } from '@/lib/store';

type ConnectBody = {
  action?: unknown;
  code?: unknown;
  wabaId?: unknown;
  phoneNumberId?: unknown;
  displayPhone?: unknown;
};

function publicConnection(
  connection: Awaited<ReturnType<typeof connectionForWorkspace>>,
) {
  return connection
    ? {
        provider: connection.provider,
        status: connection.status,
        displayPhone: connection.displayPhone,
      }
    : null;
}

export async function GET() {
  try {
    const workspaceId = await identity();
    const environment = runtime();
    const ready = Boolean(
      environment.META_APP_ID &&
        environment.META_EMBEDDED_SIGNUP_CONFIG_ID &&
        environment.META_APP_SECRET &&
        environment.META_TOKEN_ENCRYPTION_KEY &&
        environment.META_GRAPH_VERSION &&
        environment.META_WEBHOOK_VERIFY_TOKEN,
    );
    return Response.json({
      ready,
      appId: ready ? environment.META_APP_ID : null,
      configId: ready
        ? environment.META_EMBEDDED_SIGNUP_CONFIG_ID
        : null,
      graphVersion: ready ? environment.META_GRAPH_VERSION : null,
      connection: publicConnection(
        await connectionForWorkspace(workspaceId),
      ),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unauthorized' },
      { status: 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const workspaceId = await identity();
    const body = (await request.json()) as ConnectBody;
    const action = String(body.action || '');
    const now = new Date().toISOString();

    if (action !== 'meta')
      return Response.json({ error: 'Unsupported connection action' }, { status: 400 });
    const code = String(body.code || '');
    const wabaId = String(body.wabaId || '');
    let phoneNumberId = String(body.phoneNumberId || '');
    const environment = runtime();
    if (!code || !wabaId)
      return Response.json({ error: 'Meta signup was incomplete' }, { status: 400 });
    if (!environment.META_APP_ID || !environment.META_APP_SECRET)
      return Response.json({ error: 'Meta signup is not configured' }, { status: 503 });

    const tokenUrl = new URL(
      `https://graph.facebook.com/${graphVersion()}/oauth/access_token`,
    );
    tokenUrl.searchParams.set('client_id', environment.META_APP_ID);
    tokenUrl.searchParams.set('client_secret', environment.META_APP_SECRET);
    tokenUrl.searchParams.set('code', code);
    const tokenResponse = await fetch(tokenUrl);
    const tokenResult = (await tokenResponse.json()) as {
      access_token?: string;
      error?: { message?: string };
    };
    if (!tokenResponse.ok || !tokenResult.access_token)
      throw new Error(tokenResult.error?.message || 'Meta token exchange failed');

    if (!phoneNumberId) {
      const phonesResponse = await fetch(
        `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(wabaId)}/phone_numbers`,
        { headers: { Authorization: `Bearer ${tokenResult.access_token}` } },
      );
      const phones = (await phonesResponse.json()) as {
        data?: Array<{ id?: string }>;
      };
      phoneNumberId = String(phones.data?.[0]?.id || '');
    }
    if (!phoneNumberId) throw new Error('Meta did not return a phone number');

    const phoneResponse = await fetch(
      `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number`,
      { headers: { Authorization: `Bearer ${tokenResult.access_token}` } },
    );
    const phone = (await phoneResponse.json()) as {
      display_phone_number?: string;
    };
    if (!phoneResponse.ok || !phone.display_phone_number)
      throw new Error('Could not verify the connected WhatsApp number');
    const encrypted = await encryptAccessToken(tokenResult.access_token);

    await database()
      .prepare(
        `INSERT INTO whatsapp_connections
        (workspace_id,provider,status,display_phone,waba_id,phone_number_id,access_token,token_iv,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(workspace_id) DO UPDATE SET provider=excluded.provider,status=excluded.status,display_phone=excluded.display_phone,waba_id=excluded.waba_id,phone_number_id=excluded.phone_number_id,access_token=excluded.access_token,token_iv=excluded.token_iv,updated_at=excluded.updated_at`,
      )
      .bind(
        workspaceId,
        'meta',
        'connected',
        phone.display_phone_number,
        wabaId,
        phoneNumberId,
        encrypted.accessToken,
        encrypted.tokenIv,
        now,
        now,
      )
      .run();

    const current = await read(workspaceId);
    current.state.whatsapp = {
      accountId: phoneNumberId,
      senderPhone: phone.display_phone_number,
      lastEventAt: current.state.whatsapp?.lastEventAt || null,
      connected: true,
      provider: 'meta',
      status: 'connected',
    };
    await save(workspaceId, current.state, current.revision);
    return Response.json({
      ok: true,
      connection: {
        provider: 'meta',
        status: 'connected',
        displayPhone: phone.display_phone_number,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not connect WhatsApp',
      },
      { status: 400 },
    );
  }
}
