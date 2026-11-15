import {
  ingestWhatsApp,
  normalisePhone,
  qualify,
  type Workspace,
  type WhatsAppEvent,
} from '@/lib/domain';
import { database, read, runtime, save } from '@/lib/store';

export type CloudConnection = {
  workspaceId: string;
  provider: 'meta' | 'openclaw';
  status: 'connected' | 'attention' | 'linking' | 'disconnected';
  displayPhone: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  accessToken: string | null;
  tokenIv: string | null;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const secret = runtime().META_TOKEN_ENCRYPTION_KEY;
  if (!secret)
    throw new Error('Meta token encryption is not configured');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptAccessToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(),
    new TextEncoder().encode(token),
  );
  return {
    accessToken: bytesToBase64(new Uint8Array(cipher)),
    tokenIv: bytesToBase64(iv),
  };
}

export async function decryptAccessToken(
  accessToken: string,
  tokenIv: string,
) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(tokenIv) },
    await encryptionKey(),
    base64ToBytes(accessToken),
  );
  return new TextDecoder().decode(plain);
}

export async function connectionForWorkspace(workspaceId: string) {
  const row = await database()
    .prepare(
      'SELECT workspace_id,provider,status,display_phone,waba_id,phone_number_id,access_token,token_iv FROM whatsapp_connections WHERE workspace_id=?',
    )
    .bind(workspaceId)
    .first<{
      workspace_id: string;
      provider: 'meta' | 'openclaw';
      status: 'connected' | 'attention' | 'linking' | 'disconnected';
      display_phone: string | null;
      waba_id: string | null;
      phone_number_id: string | null;
      access_token: string | null;
      token_iv: string | null;
    }>();
  return row
    ? {
        workspaceId: row.workspace_id,
        provider: row.provider,
        status: row.status,
        displayPhone: row.display_phone,
        wabaId: row.waba_id,
        phoneNumberId: row.phone_number_id,
        accessToken: row.access_token,
        tokenIv: row.token_iv,
      }
    : null;
}

function replyFor(state: Workspace, event: WhatsAppEvent, phone: string) {
  const contact = state.contacts?.find((item) => item.phone === phone);
  if (!contact) throw new Error('Contact is not in the CRM allowlist');
  const lead = state.leads?.find((item) => item.phone === phone);
  const messages = lead?.messages || [];
  const leadState: Workspace = {
    ...state,
    requirements: lead?.requirements || {},
    messages,
    status: lead?.status || 'New',
    interestedId: lead?.interestedId || null,
    meeting: lead?.meeting || null,
    blocked: lead?.blocked || 0,
  };
  const derived = qualify(leadState, event.text);
  const response = derived.messages[messages.length + 1];
  if (!response || response.role !== 'agent')
    throw new Error('The cloud agent did not produce a reply');
  return response.text;
}

export async function processCloudInbound(
  workspaceId: string,
  event: WhatsAppEvent,
  contactPhone: string,
  send: (reply: string) => Promise<void>,
) {
  const phone = normalisePhone(contactPhone);
  const duplicate = await database()
    .prepare('SELECT id FROM whatsapp_events WHERE workspace_id=? AND id=?')
    .bind(workspaceId, event.id)
    .first();
  if (duplicate) return { duplicate: true, reply: null };

  const current = await read(workspaceId);
  const reply = replyFor(current.state, event, phone);
  const inbound = ingestWhatsApp(current.state, event, phone);
  await save(workspaceId, inbound, current.revision);
  await database()
    .prepare(
      'INSERT OR IGNORE INTO whatsapp_events (id,workspace_id,direction,contact_phone,content,occurred_at,created_at) VALUES (?,?,?,?,?,?,?)',
    )
    .bind(
      event.id,
      workspaceId,
      'received',
      phone,
      event.text,
      event.at,
      new Date().toISOString(),
    )
    .run();

  await send(reply);
  const latest = await read(workspaceId);
  const replyEvent: WhatsAppEvent = {
    id: `${event.id}-reply`,
    direction: 'sent',
    text: reply,
    at: new Date().toISOString(),
  };
  const completed = ingestWhatsApp(latest.state, replyEvent, phone);
  await save(workspaceId, completed, latest.revision);
  await database()
    .prepare(
      'INSERT OR IGNORE INTO whatsapp_events (id,workspace_id,direction,contact_phone,content,occurred_at,created_at) VALUES (?,?,?,?,?,?,?)',
    )
    .bind(
      replyEvent.id,
      workspaceId,
      'sent',
      phone,
      reply,
      replyEvent.at,
      new Date().toISOString(),
    )
    .run();
  return { duplicate: false, reply };
}

export function graphVersion() {
  const version = runtime().META_GRAPH_VERSION;
  if (!/^v\d+\.\d+$/.test(version || ''))
    throw new Error('META_GRAPH_VERSION is not configured');
  return version;
}

export async function sendMetaMessage(
  connection: CloudConnection,
  recipient: string,
  text: string,
) {
  if (
    !connection.phoneNumberId ||
    !connection.accessToken ||
    !connection.tokenIv
  )
    throw new Error('Meta connection is incomplete');
  const token = await decryptAccessToken(
    connection.accessToken,
    connection.tokenIv,
  );
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion()}/${connection.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalisePhone(recipient).replace(/^\+/, ''),
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    },
  );
  if (!response.ok)
    throw new Error(`Meta rejected the reply (${response.status})`);
}

export async function verifyMetaSignature(request: Request, body: string) {
  const signature = request.headers.get('x-hub-signature-256') || '';
  const appSecret = runtime().META_APP_SECRET;
  if (!appSecret || !signature.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(body),
  );
  const expected = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const actual = signature.slice('sha256='.length).toLowerCase();
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++)
    mismatch |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return mismatch === 0;
}
