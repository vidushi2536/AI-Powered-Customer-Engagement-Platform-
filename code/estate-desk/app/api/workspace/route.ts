import { database, identity, read, save, runtime } from '@/lib/store';
import {
  brief,
  dashboardStats,
  normalisePhone,
  workspaceInsights,
  type Contact,
  type Lead,
  type Property,
} from '@/lib/domain';
export async function GET() {
  try {
    const id = await identity(),
      { state } = await read(id);
    return Response.json(
      {
        state,
        brief: brief(state),
        stats: dashboardStats(state),
        insights: workspaceInsights(state),
        integrations: {
          openclaw: !!runtime().WHATSAPP_SYNC_SECRET,
          sms: !!runtime().TWILIO_VERIFY_SERVICE_SID,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
function failure(e: unknown) {
  const message = e instanceof Error ? e.message : 'Request failed';
  return Response.json(
    { error: message },
    { status: message === 'UNAUTHORIZED' ? 401 : 400 },
  );
}

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : fallback;
}

export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin)
      throw new Error('Origin not allowed');
    const id = await identity();
    if (Number(req.headers.get('content-length') || 0) > 250000)
      throw new Error('Upload too large');
    const raw = await req.text();
    if (raw.length > 250000) throw new Error('Upload too large');
    const body = JSON.parse(raw);
    const { state, revision } = await read(id);
    const next = state;
    let contactsToSync: Contact[] | null = null;
    switch (body.action) {
      case 'onboarding': {
        if (body.consentConfirmed !== true)
          throw new Error(
            'Confirm that you are authorised to store these CRM contacts.',
          );
        if (
          !Array.isArray(body.contacts) ||
          !body.contacts.length ||
          body.contacts.length > 500
        )
          throw new Error('Upload a CRM CSV containing 1–500 contacts.');
        const seen = new Set<string>();
        const now = new Date().toISOString();
        const contacts: Contact[] = body.contacts.map(
          (value: Record<string, unknown>, index: number) => {
            const phone = normalisePhone(textValue(value.phone));
            if (!/^\+\d{10,15}$/.test(phone))
              throw new Error(`CRM row ${index + 1}: invalid phone number.`);
            if (seen.has(phone))
              throw new Error(`CRM row ${index + 1}: duplicate phone number.`);
            seen.add(phone);
            const consent = textValue(
              value.consent,
              'inbound-only',
            ).toLowerCase();
            if (!['inbound-only', 'opted-in', 'opted-out'].includes(consent))
              throw new Error(`CRM row ${index + 1}: invalid consent value.`);
            return {
              phone,
              name: textValue(value.name, `Contact ${index + 1}`).slice(0, 80),
              consent: consent as Contact['consent'],
              addedAt: now,
            };
          },
        );
        if (Array.isArray(body.properties) && body.properties.length) {
          if (body.properties.length > 500)
            throw new Error('Upload no more than 500 property listings.');
          state.properties = body.properties.map(
            (p: Record<string, unknown>, index: number): Property => {
              const location = textValue(p.location).trim();
              const bedrooms = Number(p.bedrooms);
              const sqft = Number(p.sqft);
              const priceLakhs = Number(p.priceLakhs);
              if (!/^[\p{L}\d .,'()-]{2,90}$/u.test(location))
                throw new Error(`Property row ${index + 1}: invalid location.`);
              if (
                ![bedrooms, sqft, priceLakhs].every(Number.isFinite) ||
                bedrooms < 1 ||
                bedrooms > 20 ||
                sqft < 100 ||
                sqft > 1000000 ||
                priceLakhs <= 0 ||
                priceLakhs > 100000
              )
                throw new Error(
                  `Property row ${index + 1}: invalid numeric value.`,
                );
              return {
                id: `CSV-${crypto.randomUUID().slice(0, 8)}`,
                location,
                bedrooms,
                sqft,
                priceLakhs,
                bathrooms: Number.isFinite(Number(p.bathrooms))
                  ? Number(p.bathrooms)
                  : null,
                balconies: Number.isFinite(Number(p.balconies))
                  ? Number(p.balconies)
                  : 0,
                areaType: textValue(p.areaType, 'Uploaded listing').slice(
                  0,
                  60,
                ),
                source: 'Your CSV',
                availability: 'Uploaded listing — verify live availability',
                image: '/images/interior-warm.jpg',
              };
            },
          );
        }
        const previous = new Map(
          (state.leads || []).map((lead) => [lead.phone, lead]),
        );
        state.contacts = contacts;
        state.leads = contacts.map(
          (contact): Lead =>
            previous.get(contact.phone) || {
              phone: contact.phone,
              name: contact.name,
              status: contact.consent === 'opted-out' ? 'Opted out' : 'New',
              requirements: {},
              messages: [],
              interestedId: null,
              meeting: null,
              blocked: 0,
              updatedAt: now,
            },
        );
        state.crm = true;
        state.onboardingComplete = true;
        await save(id, state, revision);
        const db = database();
        await db
          .prepare('DELETE FROM workspace_contacts WHERE workspace_id=?')
          .bind(id)
          .run();
        await db.batch(
          contacts.map((contact) =>
            db
              .prepare(
                'INSERT INTO workspace_contacts (phone,workspace_id,name,consent,created_at) VALUES (?,?,?,?,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name,consent=excluded.consent,created_at=excluded.created_at WHERE workspace_contacts.workspace_id=excluded.workspace_id',
              )
              .bind(
                contact.phone,
                id,
                contact.name,
                contact.consent,
                contact.addedAt,
              ),
          ),
        );
        return Response.json({
          state,
          brief: brief(state),
          stats: dashboardStats(state),
          insights: workspaceInsights(state),
        });
      }
      case 'addContacts': {
        if (body.consentConfirmed !== true)
          throw new Error(
            'Confirm that you are authorised to store these CRM contacts.',
          );
        if (
          !Array.isArray(body.contacts) ||
          !body.contacts.length ||
          body.contacts.length > 100
        )
          throw new Error('Add 1–100 contacts at a time.');
        const now = new Date().toISOString();
        const incoming: Contact[] = body.contacts.map(
          (value: Record<string, unknown>, index: number) => {
            const phone = normalisePhone(textValue(value.phone));
            if (!/^\+\d{10,15}$/.test(phone))
              throw new Error(`CRM row ${index + 1}: invalid phone number.`);
            const consent = textValue(
              value.consent,
              'inbound-only',
            ).toLowerCase();
            if (!['inbound-only', 'opted-in', 'opted-out'].includes(consent))
              throw new Error(`CRM row ${index + 1}: invalid consent value.`);
            return {
              phone,
              name: textValue(value.name, `Contact ${index + 1}`).slice(0, 80),
              consent: consent as Contact['consent'],
              addedAt: now,
            };
          },
        );
        const unique = new Map(incoming.map((contact) => [contact.phone, contact]));
        const totalPhones = new Set([
          ...(state.contacts || []).map((contact) => contact.phone),
          ...unique.keys(),
        ]).size;
        if (totalPhones > 500)
          throw new Error('Maximum 500 CRM contacts per workspace.');
        const db = database();
        for (const contact of unique.values()) {
          const existing = await db
            .prepare('SELECT workspace_id FROM workspace_contacts WHERE phone=?')
            .bind(contact.phone)
            .first<{ workspace_id: string }>();
          if (existing && existing.workspace_id !== id)
            throw new Error(`${contact.phone} is already assigned to another workspace.`);
        }
        const merged = new Map(
          (state.contacts || []).map((contact) => [contact.phone, contact]),
        );
        for (const contact of unique.values()) merged.set(contact.phone, contact);
        state.contacts = [...merged.values()];
        const leads = new Map((state.leads || []).map((lead) => [lead.phone, lead]));
        for (const contact of unique.values()) {
          const current = leads.get(contact.phone);
          if (current) {
            current.name = contact.name;
            if (contact.consent === 'opted-out') current.status = 'Opted out';
          } else {
            leads.set(contact.phone, {
              phone: contact.phone,
              name: contact.name,
              status: contact.consent === 'opted-out' ? 'Opted out' : 'New',
              requirements: {},
              messages: [],
              interestedId: null,
              meeting: null,
              blocked: 0,
              updatedAt: now,
            });
          }
        }
        state.leads = [...leads.values()];
        contactsToSync = [...unique.values()];
        break;
      }
      case 'agent':
        if (typeof body.enabled !== 'boolean')
          throw new Error('Invalid agent state');
        state.agentEnabled = body.enabled;
        break;
      case 'crm':
        if (typeof body.connected !== 'boolean')
          throw new Error('Invalid CRM state');
        state.crm = body.connected;
        break;
      case 'note':
        if (typeof body.note !== 'string' || body.note.length > 2000)
          throw new Error('Note must be under 2,000 characters');
        state.note = body.note;
        break;
      case 'meeting': {
        if (!state.interestedId || state.status === 'Opted out')
          throw new Error(
            'A buyer must express interest before proposing a viewing.',
          );
        const date = new Date(body.date);
        if (!Number.isFinite(date.getTime()) || date.getTime() < Date.now())
          throw new Error('Choose a future date and time');
        state.meeting = {
          propertyId: state.interestedId,
          date: date.toISOString(),
          note: String(body.note || '').slice(0, 500),
        };
        state.status = 'Viewing proposed';
        break;
      }
      case 'addProperties':
      case 'upload': {
        if (
          !Array.isArray(body.properties) ||
          !body.properties.length ||
          body.properties.length > 100
        )
          throw new Error('Upload 1–100 properties');
        const records: Property[] = body.properties.map(
          (p: Record<string, unknown>, i: number) => {
            if (
              typeof p.location !== 'string' ||
              !/^[\p{L}\d .,'()-]{2,90}$/u.test(p.location)
            )
              throw new Error(`Row ${i + 1}: invalid location`);
            for (const key of ['bedrooms', 'sqft', 'priceLakhs'])
              if (
                typeof p[key] !== 'number' ||
                !Number.isFinite(p[key]) ||
                Number(p[key]) <= 0
              )
                throw new Error(`Row ${i + 1}: invalid ${key}`);
            if (
              Number(p.bedrooms) > 20 ||
              Number(p.sqft) > 1000000 ||
              Number(p.priceLakhs) > 100000
            )
              throw new Error(`Row ${i + 1}: value out of range`);
            return {
              id: 'CSV-' + crypto.randomUUID().slice(0, 8),
              location: p.location,
              bedrooms: Number(p.bedrooms),
              sqft: Number(p.sqft),
              priceLakhs: Number(p.priceLakhs),
              bathrooms: null,
              balconies: 0,
              areaType: 'Uploaded listing',
              source: 'Your CSV',
              availability: 'Owner-uploaded — verify availability',
              image: '/images/interior-warm.jpg',
            };
          },
        );
        if (state.properties.length + records.length > 500)
          throw new Error('Maximum 500 listings per demo workspace');
        state.properties.push(...records);
        break;
      }
      default:
        throw new Error('Action not allowed');
    }
    await save(id, next, revision);
    if (contactsToSync) {
      const db = database();
      await db.batch(
        contactsToSync.map((contact) =>
          db
            .prepare(
              'INSERT INTO workspace_contacts (phone,workspace_id,name,consent,created_at) VALUES (?,?,?,?,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name,consent=excluded.consent,created_at=excluded.created_at WHERE workspace_contacts.workspace_id=excluded.workspace_id',
            )
            .bind(
              contact.phone,
              id,
              contact.name,
              contact.consent,
              contact.addedAt,
            ),
        ),
      );
    }
    return Response.json({
      state: next,
      brief: brief(next),
      stats: dashboardStats(next),
      insights: workspaceInsights(next),
    });
  } catch (e) {
    return failure(e);
  }
}
