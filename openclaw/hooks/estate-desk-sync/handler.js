import { createHash } from 'node:crypto';

const allowedPhone = phone(process.env.ALLOWED_WHATSAPP_PHONE);
const allowedAccount = 'shellsworth';

function phone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

export default async function estateDeskSync(event) {
  if (event.type !== 'message' || !['received', 'sent'].includes(event.action))
    return;
  const context = event.context || {};
  if (context.channelId !== 'whatsapp' || context.accountId !== allowedAccount)
    return;
  if (event.action === 'sent' && context.success !== true) return;
  const contact =
    event.action === 'received'
      ? phone(context.metadata?.senderE164 || context.from)
      : phone(context.to);
  if (!allowedPhone || contact !== allowedPhone) return;
  const text = String(context.content || '').trim();
  if (!text || text.length > 1200) return;
  const timestamp = context.timestamp || event.timestamp || new Date();
  const id =
    context.messageId ||
    createHash('sha256')
      .update(
        JSON.stringify([
          event.action,
          context.accountId,
          contact,
          String(timestamp),
          text,
        ]),
      )
      .digest('hex');
  try {
    const response = await fetch(process.env.ESTATE_DESK_SYNC_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.ESTATE_DESK_SYNC_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: `wa-${id}`,
        direction: event.action,
        channelId: context.channelId,
        accountId: context.accountId,
        contactPhone: contact,
        text,
        timestamp: new Date(timestamp).toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      console.warn('[estate-desk-sync] dashboard rejected event', response.status);
  } catch (error) {
    console.warn(
      '[estate-desk-sync] dashboard unavailable',
      error instanceof Error ? error.message : 'unknown error',
    );
  }
}
