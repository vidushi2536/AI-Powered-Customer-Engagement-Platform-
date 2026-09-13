import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Node's built-in TypeScript runner requires the explicit extension.
import {
  assertOutboundMessageAllowed,
  isHandoffRequest,
  isOptOutMessage,
  isOptInMessage,
  OutboundNotAllowedError,
} from '../lib/messaging.ts';

// A tiny fake D1 sufficient for assertOutboundMessageAllowed's two SELECTs.
// Real integration coverage against a live D1 binding lives in
// tests/api-smoke.mjs, which requires a running dev server.
function fakeDb({
  campaignExists = true,
  contact,
}: {
  campaignExists?: boolean;
  contact?: { status: string; opted_out: number; agent_paused: number } | null;
}) {
  return {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            async first() {
              if (sql.includes('FROM campaigns')) {
                return campaignExists ? { id: 'camp_1' } : null;
              }
              if (sql.includes('FROM campaign_contacts')) {
                return contact ?? null;
              }
              return null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

test('allowed, enabled, non-opted-out contact may be contacted', async () => {
  const db = fakeDb({ contact: { status: 'active', opted_out: 0, agent_paused: 0 } });
  const result = await assertOutboundMessageAllowed({ db, campaignId: 'camp_1', recipientPhone: '+1 555 000 1111' });
  assert.equal(result.phone, '+15550001111');
});

test('a number not on the allowlist is rejected', async () => {
  const db = fakeDb({ contact: null });
  await assert.rejects(
    () => assertOutboundMessageAllowed({ db, campaignId: 'camp_1', recipientPhone: '+15550001111' }),
    (e: unknown) => e instanceof OutboundNotAllowedError && e.code === 'CONTACT_NOT_ALLOWED',
  );
});

test('an opted-out contact is rejected', async () => {
  const db = fakeDb({ contact: { status: 'active', opted_out: 1, agent_paused: 0 } });
  await assert.rejects(
    () => assertOutboundMessageAllowed({ db, campaignId: 'camp_1', recipientPhone: '+15550001111' }),
    (e: unknown) => e instanceof OutboundNotAllowedError && e.code === 'CONTACT_OPTED_OUT',
  );
});

test('a conversation paused for handoff is rejected', async () => {
  const db = fakeDb({ contact: { status: 'handed_off', opted_out: 0, agent_paused: 1 } });
  await assert.rejects(
    () => assertOutboundMessageAllowed({ db, campaignId: 'camp_1', recipientPhone: '+15550001111' }),
    (e: unknown) => e instanceof OutboundNotAllowedError && e.code === 'CONVERSATION_PAUSED',
  );
});

test('an invalid phone number is rejected before any lookup', async () => {
  const db = fakeDb({ contact: { status: 'active', opted_out: 0, agent_paused: 0 } });
  await assert.rejects(
    () => assertOutboundMessageAllowed({ db, campaignId: 'camp_1', recipientPhone: 'not-a-phone' }),
    (e: unknown) => e instanceof OutboundNotAllowedError && e.code === 'INVALID_PHONE_NUMBER',
  );
});

test('a nonexistent campaign is rejected', async () => {
  const db = fakeDb({ campaignExists: false, contact: { status: 'active', opted_out: 0, agent_paused: 0 } });
  await assert.rejects(
    () => assertOutboundMessageAllowed({ db, campaignId: 'camp_missing', recipientPhone: '+15550001111' }),
    (e: unknown) => e instanceof OutboundNotAllowedError && e.code === 'CAMPAIGN_NOT_FOUND',
  );
});

test('opt-out keywords are recognised', () => {
  for (const text of ['STOP', 'please unsubscribe', 'Do not contact me again', 'no more messages please']) {
    assert.equal(isOptOutMessage(text), true, text);
  }
  assert.equal(isOptOutMessage('I want to stop by the property tomorrow'), true); // conservative: contains "stop"
  assert.equal(isOptOutMessage('2 bedroom under 2000'), false);
});

test('only an exact START re-enables contact', () => {
  assert.equal(isOptInMessage('START'), true);
  assert.equal(isOptInMessage('  start  '), true);
  assert.equal(isOptInMessage('lets start looking'), false);
});

test('natural-language human handoff requests are recognised', () => {
  for (const text of [
    'I want to speak to a human',
    'Connect me to an agent please',
    'Let me talk to someone',
    'Human please',
    'call me',
    '2',
  ]) {
    assert.equal(isHandoffRequest(text), true, text);
  }
  assert.equal(isHandoffRequest('2 bedroom under 2000'), false);
});
