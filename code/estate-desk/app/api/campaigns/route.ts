// app/api/campaigns/route.ts
import { env } from 'cloudflare:workers';
import {
  parseContactsCsv,
  parsePropertiesCsv,
  newId,
} from '@/lib/campaigns';

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function db() {
  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  return env.DB;
}

// TODO: replace with real dashboard auth once lib/store.ts (identity/session
// handling) is available. For now this route has no auth of its own — do not
// expose it publicly without adding a check.

export async function GET() {
  const database = db();
  const { results: campaigns } = await database
    .prepare('SELECT * FROM campaigns ORDER BY created_at DESC')
    .all<Record<string, unknown>>();

  const withCounts = await Promise.all(
    campaigns.map(async (c) => {
      const contactCount = await database
        .prepare('SELECT COUNT(*) as n FROM campaign_contacts WHERE campaign_id=?')
        .bind(c.id)
        .first<{ n: number }>();
      const propertyCount = await database
        .prepare('SELECT COUNT(*) as n FROM properties WHERE campaign_id=?')
        .bind(c.id)
        .first<{ n: number }>();
      return {
        ...c,
        contactCount: contactCount?.n ?? 0,
        propertyCount: propertyCount?.n ?? 0,
      };
    }),
  );

  return Response.json({ campaigns: withCounts });
}

type CreateBody = {
  name?: unknown;
  workspaceId?: unknown;
  contactsCsv?: unknown;
  propertiesCsv?: unknown;
};

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 2_000_000)
    return fail('Upload too large', 413);

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return fail('Invalid JSON');
  }

  const name = String(body.name || '').trim();
  if (!name || name.length > 120)
    return fail('Campaign name is required (max 120 chars)');

  const workspaceId = String(body.workspaceId || '').trim();
  if (!workspaceId) return fail('workspaceId is required');

  const contactsCsv = String(body.contactsCsv || '');
  const propertiesCsv = String(body.propertiesCsv || '');
  if (!contactsCsv.trim()) return fail('contactsCsv is required');
  if (!propertiesCsv.trim()) return fail('propertiesCsv is required');

  const contacts = parseContactsCsv(contactsCsv);
  if (!contacts.length)
    return fail('No valid phone numbers found in contactsCsv');
  if (contacts.length > 5000) return fail('Maximum 5,000 contacts per campaign');

  let parsedProperties;
  try {
    parsedProperties = parsePropertiesCsv(propertiesCsv);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Invalid propertiesCsv');
  }
  if (!parsedProperties.length)
    return fail('No valid property rows found in propertiesCsv');
  if (parsedProperties.length > 2000)
    return fail('Maximum 2,000 properties per campaign');

  const database = db();
  const now = new Date().toISOString();
  const campaignId = newId('camp');

  const statements = [
    database
      .prepare(
        'INSERT INTO campaigns (id, workspace_id, name, status, created_at, updated_at) VALUES (?,?,?,?,?,?)',
      )
      .bind(campaignId, workspaceId, name, 'draft', now, now),
    ...contacts.map((c) =>
      database
        .prepare(
          'INSERT INTO campaign_contacts (id, campaign_id, phone, status, created_at, updated_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(newId('cc'), campaignId, c.phone, 'pending', now, now),
    ),
    ...parsedProperties.map((p) =>
      database
        .prepare(
          'INSERT INTO properties (id, campaign_id, address, location, price, bedrooms, size_sqft, property_type, is_hot, demand_score, raw_source, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          newId('prop'),
          campaignId,
          p.location,
          p.location,
          p.price,
          p.bedrooms,
          p.sizeSqft,
          null,
          0,
          0,
          'CSV upload',
          now,
        ),
    ),
  ];

  // D1 batch runs all statements as a single transaction.
  await database.batch(statements);

  return Response.json({
    campaign: { id: campaignId, name, status: 'draft', createdAt: now },
    contactsImported: contacts.length,
    propertiesImported: parsedProperties.length,
  });
}