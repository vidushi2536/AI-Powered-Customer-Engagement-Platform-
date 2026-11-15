import {
  connectionForWorkspace,
  processCloudInbound,
  sendMetaMessage,
  verifyMetaSignature,
} from '@/lib/cloud-whatsapp';
import { database, runtime } from '@/lib/store';

type MetaWebhook = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const valid =
    url.searchParams.get('hub.mode') === 'subscribe' &&
    url.searchParams.get('hub.verify_token') ===
      runtime().META_WEBHOOK_VERIFY_TOKEN;
  if (!valid) return new Response('Forbidden', { status: 403 });
  return new Response(url.searchParams.get('hub.challenge') || '', {
    status: 200,
  });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!(await verifyMetaSignature(request, raw)))
    return new Response('Invalid signature', { status: 401 });
  let payload: MetaWebhook;
  try {
    payload = JSON.parse(raw) as MetaWebhook;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id || '';
      if (!phoneNumberId) continue;
      const row = await database()
        .prepare(
          "SELECT workspace_id FROM whatsapp_connections WHERE provider='meta' AND status='connected' AND phone_number_id=?",
        )
        .bind(phoneNumberId)
        .first<{ workspace_id: string }>();
      if (!row) continue;
      const connection = await connectionForWorkspace(row.workspace_id);
      if (!connection) continue;
      for (const message of change.value?.messages || []) {
        if (
          message.type !== 'text' ||
          !message.id ||
          !message.from ||
          !message.text?.body
        )
          continue;
        const timestamp = Number(message.timestamp || 0) * 1000;
        await processCloudInbound(
          row.workspace_id,
          {
            id: `meta-${message.id}`,
            direction: 'received',
            text: message.text.body,
            at: new Date(timestamp || Date.now()).toISOString(),
          },
          `+${message.from.replace(/\D/g, '')}`,
          (reply) => sendMetaMessage(connection, message.from || '', reply),
        );
      }
    }
  }
  return Response.json({ ok: true });
}
