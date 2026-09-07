import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

const agentId = 'estate-desk';
const allowedPhone = normalize(process.env.ALLOWED_WHATSAPP_PHONE);
const forbidden =
  /(system\s*prompt|api.?key|password|secret|token|ignore.{0,40}instruction|jailbreak|developer\s*mode|\b(shell|bash|powershell|sudo|execute|exec|malware|hack|seashell|politics|election|bitcoin|recipe|poem)\b|<\/?script|https?:\/\/|\`\`\`)/i;
const propertyLanguage =
  /\b(property|properties|home|house|flat|apartment|listing|bhk|bedroom|bathroom|budget|lakh|crore|gurugram|gurgaon|sector|sq\s*ft|viewing|visit|advisor|price|availability|buyer|interested|timeline|stop|start|opted out|hello|hi|thanks|thank you)\b/i;

function isEstateDesk(ctx: Record<string, unknown>) {
  return (
    ctx.agentId === agentId ||
    String(ctx.sessionKey || '').includes(`agent:${agentId}:`)
  );
}

function normalize(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

export default definePluginEntry({
  id: 'estate-desk-policy',
  name: 'Estate Desk Policy',
  description: 'Fail-closed input and output policy for one real-estate WhatsApp peer.',
  register(api) {
    api.on('before_agent_run', (event, ctx) => {
      if (!isEstateDesk(ctx as Record<string, unknown>)) return;
      const prompt = String(event.prompt || '');
      if (forbidden.test(prompt)) {
        return {
          outcome: 'block',
          reason: 'estate_desk_out_of_scope',
          message:
            'I can only help with Gurugram property requirements, catalog listings and viewing interest. What budget, bedroom count and sector should I use?',
        };
      }
    });

    api.on('message_sending', (event, ctx) => {
      if (!isEstateDesk(ctx as Record<string, unknown>)) return;
      const channel = String(
        (event as Record<string, unknown>).channelId ||
          (event as Record<string, unknown>).channel ||
          (ctx as Record<string, unknown>).channel ||
          '',
      );
      const target = normalize(
        (event as Record<string, unknown>).to ||
          (event as Record<string, unknown>).recipient,
      );
      if (channel && channel !== 'whatsapp')
        return { cancel: true, cancelReason: 'estate_desk_whatsapp_only' };
      if (!allowedPhone || !target || target !== allowedPhone)
        return { cancel: true, cancelReason: 'estate_desk_contact_not_allowed' };
      const content = String(event.content || '');
      if (
        !content ||
        content.length > 900 ||
        forbidden.test(content) ||
        !propertyLanguage.test(content)
      ) {
        return {
          content:
            'I can only help with Gurugram property requirements, catalog listings and viewing interest. Please share your budget, bedroom count and preferred sector.',
        };
      }
    });
  },
});
