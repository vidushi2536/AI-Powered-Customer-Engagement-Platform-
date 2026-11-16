import { database, identity, read, save, runtime } from '@/lib/store';
import { openClawRuntime } from '@/lib/openclaw-runtime';
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
        const ownerPhone = normalisePhone(textValue(body.ownerPhone));
        if (!/^\+\d{10,15}$/.test(ownerPhone))
          throw new Error('Enter your WhatsApp number with its country code.');
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
        const db = database();
        const currentOwner = await db
          .prepare('SELECT workspace_id FROM phone_owners WHERE phone=?')
          .bind(ownerPhone)
          .first<{ workspace_id: string }>();
        if (currentOwner && currentOwner.workspace_id !== id)
          throw new Error(
            'This WhatsApp number is already connected to another workspace. Use a different number or sign in with the Google account that added it.',
          );
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
        state.ownerPhone = ownerPhone;
        state.phone = ownerPhone;
        state.phoneMode = 'google';
        state.whatsapp = {
          accountId: 'unlinked',
          senderPhone: ownerPhone,
          lastEventAt: state.whatsapp?.lastEventAt || null,
          connected: false,
          provider: 'openclaw',
          status: 'disconnected',
        };
        state.onboardingComplete = false;
        await save(id, state, revision);
        await db
          .prepare('DELETE FROM workspace_contacts WHERE workspace_id=?')
          .bind(id)
          .run();
        await db.batch(
          contacts.map((contact) =>
            db
              .prepare(
                'INSERT INTO workspace_contacts (phone,workspace_id,name,consent,created_at) VALUES (?,?,?,?,?) ON CONFLICT(workspace_id,phone) DO UPDATE SET name=excluded.name,consent=excluded.consent,created_at=excluded.created_at',
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
        const unique = new Map(
          incoming.map((contact) => [contact.phone, contact]),
        );
        const totalPhones = new Set([
          ...(state.contacts || []).map((contact) => contact.phone),
          ...unique.keys(),
        ]).size;
        if (totalPhones > 500)
          throw new Error('Maximum 500 CRM contacts per workspace.');
        const merged = new Map(
          (state.contacts || []).map((contact) => [contact.phone, contact]),
        );
        for (const contact of unique.values())
          merged.set(contact.phone, contact);
        state.contacts = [...merged.values()];
        const leads = new Map(
          (state.leads || []).map((lead) => [lead.phone, lead]),
        );
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
        const lead = body.phone
          ? (state.leads || []).find(
              (item) => item.phone === normalisePhone(textValue(body.phone)),
            )
          : null;
        const propertyId = textValue(
          body.propertyId,
          lead?.interestedId || state.interestedId || '',
        );
        const property = state.properties.find(
          (item) => item.id === propertyId,
        );
        if (!property)
          throw new Error(
            'Choose a verified property from the current catalog.',
          );
        if ((lead?.status || state.status) === 'Opted out')
          throw new Error(
            'A buyer must express interest before proposing a viewing.',
          );
        const date = new Date(body.date);
        if (!Number.isFinite(date.getTime()) || date.getTime() < Date.now())
          throw new Error('Choose a future date and time');
        const meeting = {
          propertyId: property.id,
          date: date.toISOString(),
          note: String(body.note || '').slice(0, 500),
          status: 'proposed' as const,
          updatedAt: new Date().toISOString(),
        };
        if (lead) {
          lead.meeting = meeting;
          lead.interestedId = property.id;
          lead.status = 'Viewing proposed';
          lead.updatedAt = meeting.updatedAt;
        } else {
          state.meeting = meeting;
          state.interestedId = property.id;
          state.status = 'Viewing proposed';
        }
        break;
      }
      case 'viewingStatus': {
        const phone = normalisePhone(textValue(body.phone));
        const lead = (state.leads || []).find((item) => item.phone === phone);
        if (!lead?.meeting) throw new Error('Viewing not found.');
        const status = textValue(body.status);
        if (
          !['proposed', 'confirmed', 'completed', 'reschedule-needed'].includes(
            status,
          )
        )
          throw new Error('Invalid viewing status.');
        lead.meeting = {
          ...lead.meeting,
          status: status as
            | 'proposed'
            | 'confirmed'
            | 'completed'
            | 'reschedule-needed',
          updatedAt: new Date().toISOString(),
        };
        lead.updatedAt = lead.meeting.updatedAt!;
        break;
      }
      case 'assignLead': {
        const phone = normalisePhone(textValue(body.phone));
        const lead = (state.leads || []).find((item) => item.phone === phone);
        if (!lead) throw new Error('Lead not found.');
        const owner = textValue(body.owner).trim().slice(0, 80);
        lead.owner = owner || null;
        lead.updatedAt = new Date().toISOString();
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
    if (
      [
        'addContacts',
        'meeting',
        'viewingStatus',
        'assignLead',
        'addProperties',
        'upload',
      ].includes(String(body.action))
    ) {
      const connection = await database()
        .prepare(
          'SELECT runtime_account_id FROM whatsapp_connections WHERE workspace_id=? AND provider=?',
        )
        .bind(id, 'openclaw')
        .first<{ runtime_account_id: string | null }>();
      if (connection?.runtime_account_id) {
        await openClawRuntime('/v1/context/sync', {
          method: 'POST',
          body: JSON.stringify({ accountId: connection.runtime_account_id }),
          timeoutMs: 20_000,
        }).catch((error) =>
          console.warn(
            'Estate Desk agent context refresh failed',
            error instanceof Error ? error.message : 'unknown error',
          ),
        );
      }
    }
    if (contactsToSync) {
      const db = database();
      await db.batch(
        contactsToSync.map((contact) =>
          db
            .prepare(
              'INSERT INTO workspace_contacts (phone,workspace_id,name,consent,created_at) VALUES (?,?,?,?,?) ON CONFLICT(workspace_id,phone) DO UPDATE SET name=excluded.name,consent=excluded.consent,created_at=excluded.created_at',
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
