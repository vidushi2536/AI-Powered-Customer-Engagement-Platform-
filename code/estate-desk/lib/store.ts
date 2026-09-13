// lib/store.ts
//
// RECONSTRUCTED FILE. Imported by every legacy-workspace API route
// (workspace, phone, whatsapp/events) but never committed to the
// repository. The shape below was inferred from those call sites.
//
// Persistence and identity for the single-workspace WhatsApp demo. Talks to
// Cloudflare D1 and the ChatGPT-auth headers; keeps `lib/domain.ts` free of
// I/O so the domain rules stay unit-testable.

import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import propertyCatalog from '@/data/properties.json';
import { normalisePhone, type Property, type Workspace } from './domain';

type RuntimeEnv = {
  ALLOWED_WHATSAPP_PHONE?: string;
  WHATSAPP_SYNC_SECRET?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_VERIFY_SERVICE_SID?: string;
  [key: string]: string | undefined;
};

/** Raw access to the environment bindings/vars this app relies on. */
export function runtime(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

/** The Cloudflare D1 binding. Throws (fail closed) if it isn't wired up. */
export function database(): D1Database {
  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  return env.DB;
}

/**
 * The single WhatsApp number this demo is permitted to talk to. Fails
 * closed: if it isn't configured, nothing may be treated as allowlisted.
 */
export function allowedPhone(): string {
  const raw = runtime().ALLOWED_WHATSAPP_PHONE;
  if (!raw) throw new Error('ALLOWED_WHATSAPP_PHONE is not configured.');
  return normalisePhone(raw);
}

/** Resolves the authenticated ChatGPT user to a stable workspace id. */
export async function identity(): Promise<string> {
  const user = await getChatGPTUser();
  if (!user) throw new Error('UNAUTHORIZED');
  return `user:${user.userId}`;
}

function initialWorkspace(): Workspace {
  return {
    phone: null,
    phoneMode: 'demo',
    crm: true,
    agentEnabled: true,
    requirements: {},
    messages: [],
    properties: propertyCatalog as Property[],
    status: 'New',
    interestedId: null,
    meeting: null,
    blocked: 0,
    note: '',
    updatedAt: new Date().toISOString(),
  };
}

type WorkspaceRow = { state: string; revision: number };

/** Reads (creating on first access) a workspace's state and revision. */
export async function read(
  id: string,
): Promise<{ state: Workspace; revision: number }> {
  const db = database();
  const row = await db
    .prepare('SELECT state, revision FROM workspaces WHERE id=?')
    .bind(id)
    .first<WorkspaceRow>();
  if (row) return { state: JSON.parse(row.state) as Workspace, revision: row.revision };

  const now = new Date().toISOString();
  const state = initialWorkspace();
  await db
    .prepare(
      'INSERT INTO workspaces (id, state, revision, updated_at) VALUES (?,?,0,?) ON CONFLICT(id) DO NOTHING',
    )
    .bind(id, JSON.stringify(state), now)
    .run();

  const created = await db
    .prepare('SELECT state, revision FROM workspaces WHERE id=?')
    .bind(id)
    .first<WorkspaceRow>();
  if (!created) throw new Error('Could not initialise workspace.');
  return { state: JSON.parse(created.state) as Workspace, revision: created.revision };
}

/**
 * Persists a workspace with optimistic concurrency: the write only applies
 * if `revision` still matches the stored row, otherwise it throws so the
 * caller can reload rather than silently clobbering a concurrent update.
 */
export async function save(
  id: string,
  state: Workspace,
  revision: number,
): Promise<void> {
  const db = database();
  const now = new Date().toISOString();
  const next: Workspace = { ...state, updatedAt: now };
  const result = await db
    .prepare(
      'UPDATE workspaces SET state=?, revision=revision+1, updated_at=? WHERE id=? AND revision=?',
    )
    .bind(JSON.stringify(next), now, id, revision)
    .run();
  if (!result.meta || result.meta.changes === 0) {
    throw new Error('Workspace was updated elsewhere. Reload and try again.');
  }
}
