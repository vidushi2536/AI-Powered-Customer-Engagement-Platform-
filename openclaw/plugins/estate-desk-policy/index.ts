import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { existsSync, readFileSync } from "node:fs";

const agentId = "estate-desk";
const forbidden =
  /(system\s*prompt|api.?key|password|secret|token|ignore.{0,40}instruction|jailbreak|developer\s*mode|\b(shell|bash|powershell|sudo|execute|exec|malware|hack|seashell|politics|election|bitcoin|recipe|poem)\b|<\/?script|https?:\/\/|\`\`\`)/i;
const propertyLanguage =
  /\b(property|properties|home|house|flat|apartment|listing|bhk|bedroom|bathroom|budget|lakh|crore|gurugram|gurgaon|sector|sq\s*ft|viewing|visit|advisor|price|availability|buyer|interested|timeline|stop|start|opted out|hello|hi|thanks|thank you)\b/i;

type CatalogRecord = { id: string; line: string };

function catalogRecords(): CatalogRecord[] {
  const paths = [
    "/home/node/.openclaw/workspace-estate-desk/AGENTS.md",
    "/home/node/.openclaw/workspace/AGENTS.md",
  ];
  const path = paths.find(existsSync);
  if (!path) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => /^- (?:GGN-\d+|CSV-[a-z0-9-]+)\s*\|/i.test(line))
    .map((line) => ({
      id: line.match(/^- ([^|\s]+)/)![1].toLowerCase(),
      line: line.toLowerCase(),
    }));
}

function groundedOutput(content: string) {
  const records = catalogRecords();
  if (!records.length) return false;
  const ids = content.match(/\b(?:GGN-\d+|CSV-[a-z0-9-]+)\b/gi) || [];
  if (ids.some((id) => !records.some((record) => record.id === id.toLowerCase()))) return false;
  const claims =
    content.match(/(?:₹\s*[\d,.]+\s*(?:lakh|lac|crore|cr)|\b\d+\s*bhk\b|\b[\d,]+\s*sq\s*ft\b)/gi) ||
    [];
  if (claims.length && !ids.length) return false;
  if (
    claims.some(
      (claim) =>
        !records.some(
          (record) =>
            record.line.includes(claim.toLowerCase().replaceAll(",", "")) ||
            record.line.replaceAll(",", "").includes(claim.toLowerCase().replaceAll(",", "")),
        ),
    )
  )
    return false;
  if (
    /\b(available now|is available|booking confirmed|appointment confirmed|visit is booked)\b/i.test(
      content,
    ) &&
    !/\b(not confirmed|must confirm|verify|requires confirmation)\b/i.test(content)
  )
    return false;
  return true;
}

function isEstateDesk(ctx: Record<string, unknown>) {
  return ctx.agentId === agentId || String(ctx.sessionKey || "").includes(`agent:${agentId}:`);
}

function normalize(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

export default definePluginEntry({
  id: "estate-desk-policy",
  name: "Estate Desk Policy",
  description: "Fail-closed input and output policy for CRM-approved real-estate WhatsApp peers.",
  register(api) {
    api.on("before_agent_run", (event, ctx) => {
      if (!isEstateDesk(ctx as Record<string, unknown>)) return;
      const prompt = String(event.prompt || "");
      if (forbidden.test(prompt)) {
        return {
          outcome: "block",
          reason: "estate_desk_out_of_scope",
          message:
            "I can only help with Gurugram property requirements, catalog listings and viewing interest. What budget, bedroom count and sector should I use?",
        };
      }
    });

    api.on("message_sending", (event, ctx) => {
      if (!isEstateDesk(ctx as Record<string, unknown>)) return;
      const channel = String(
        (event as Record<string, unknown>).channelId ||
          (event as Record<string, unknown>).channel ||
          (ctx as Record<string, unknown>).channel ||
          "",
      );
      const target = normalize(
        (event as Record<string, unknown>).to || (event as Record<string, unknown>).recipient,
      );
      const sessionMatch = String((ctx as Record<string, unknown>).sessionKey || "").match(
        /whatsapp:direct:(\+?\d{10,15})(?:$|:)/i,
      );
      const sessionPhone = normalize(sessionMatch?.[1]);
      if (channel && channel !== "whatsapp")
        return { cancel: true, cancelReason: "estate_desk_whatsapp_only" };
      if ((!target && !sessionPhone) || (target && sessionPhone && target !== sessionPhone))
        return { cancel: true, cancelReason: "estate_desk_contact_not_allowed" };
      const content = String(event.content || "");
      if (
        !content ||
        content.length > 900 ||
        forbidden.test(content) ||
        !propertyLanguage.test(content)
      ) {
        return {
          content:
            "I can only help with Gurugram property requirements, catalog listings and viewing interest. Please share your budget, bedroom count and preferred sector.",
        };
      }
      if (!groundedOutput(content)) {
        return {
          content:
            "I cannot verify that property detail in the current catalog, so I will not guess. Please share a catalog listing ID, or your budget, bedroom count and preferred Gurugram sector. A human advisor must confirm current price, availability and every viewing.",
        };
      }
    });
  },
});
