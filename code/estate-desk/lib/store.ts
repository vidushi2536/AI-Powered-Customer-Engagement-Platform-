import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import properties from '@/data/properties.json';
import {
  DATASET_VERSION,
  type Contact,
  type Lead,
  type Workspace,
} from './domain';
export function database() {
  if (!env.DB) throw new Error('Database unavailable');
  return env.DB;
}
export async function identity() {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie') || '';
  const token = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('estate_session='))
    ?.slice('estate_session='.length);
  if (!token) throw new Error('UNAUTHORIZED');
  const tokenHash = await hashToken(decodeURIComponent(token));
  const session = await database()
    .prepare(
      'SELECT workspace_id FROM app_sessions WHERE token_hash=? AND expires>?',
    )
    .bind(tokenHash, Date.now())
    .first<{ workspace_id: string }>();
  if (!session) throw new Error('UNAUTHORIZED');
  return session.workspace_id;
}
export function initial(): Workspace {
  return {
    ownerPhone: null,
    onboardingComplete: false,
    contacts: [],
    leads: [],
    phone: null,
    phoneMode: 'demo',
    crm: true,
    agentEnabled: true,
    requirements: {},
    messages: [],
    properties,
    datasetVersion: DATASET_VERSION,
    status: 'New',
    interestedId: null,
    meeting: null,
    blocked: 0,
    updatedAt: new Date().toISOString(),
    note: '',
    whatsapp: {
      accountId: 'shellsworth',
      senderPhone: null,
      lastEventAt: null,
      connected: false,
    },
  };
}
function hydrate(value: Workspace): Workspace {
  const base = initial();
  const uploads = Array.isArray(value.properties)
    ? value.properties.filter((property) => property.source === 'Your CSV')
    : [];
  const legacyPhone = value.phone || null;
  const contacts: Contact[] = Array.isArray(value.contacts)
    ? value.contacts
    : legacyPhone
      ? [
          {
            phone: legacyPhone,
            name: 'Imported contact',
            consent:
              value.status === 'Opted out' ? 'opted-out' : 'inbound-only',
            addedAt: value.updatedAt,
          },
        ]
      : [];
  const leads: Lead[] = Array.isArray(value.leads)
    ? value.leads
    : legacyPhone
      ? [
          {
            phone: legacyPhone,
            name: contacts[0]?.name || 'Imported contact',
            status: value.status,
            requirements: value.requirements || {},
            messages: Array.isArray(value.messages) ? value.messages : [],
            interestedId: value.interestedId,
            meeting: value.meeting,
            blocked: value.blocked || 0,
            updatedAt: value.updatedAt,
          },
        ]
      : [];
  return {
    ...base,
    ...value,
    ownerPhone: value.ownerPhone || legacyPhone,
    onboardingComplete: value.onboardingComplete === true,
    contacts,
    leads,
    requirements: value.requirements || {},
    messages: Array.isArray(value.messages) ? value.messages : [],
    properties:
      value.datasetVersion === DATASET_VERSION
        ? value.properties
        : [...properties, ...uploads],
    datasetVersion: DATASET_VERSION,
    whatsapp: { ...base.whatsapp!, ...value.whatsapp },
  };
}
export async function read(id: string) {
  const db = database();
  await db
    .prepare(
      'INSERT OR IGNORE INTO workspaces (id,state,revision,updated_at) VALUES (?,?,0,?)',
    )
    .bind(id, JSON.stringify(initial()), new Date().toISOString())
    .run();
  const row = await db
    .prepare('SELECT state,revision FROM workspaces WHERE id=?')
    .bind(id)
    .first<{ state: string; revision: number }>();
  if (!row) throw new Error('Workspace unavailable');
  return {
    state: hydrate(JSON.parse(row.state) as Workspace),
    revision: row.revision,
  };
}
export async function save(id: string, state: Workspace, revision: number) {
  state.updatedAt = new Date().toISOString();
  const result = await database()
    .prepare(
      'UPDATE workspaces SET state=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?',
    )
    .bind(JSON.stringify(state), state.updatedAt, id, revision)
    .run();
  if (result.meta.changes !== 1)
    throw new Error('Another change arrived. Refresh and try again.');
}
export function runtime() {
  return env as unknown as Record<string, string>;
}

export async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
