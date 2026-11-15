import assert from 'node:assert/strict';

const base = 'http://localhost:3000';
const suffix = String(Date.now()).slice(-7);
const sharedBuyer = `+9155${suffix}`;

async function json(path, options = {}, expected = 200) {
  const response = await fetch(base + path, options);
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(result)}`);
  return { response, result };
}

async function createBroker(prefix, property) {
  const ownerPhone = `+91${prefix}${suffix}`;
  await json('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ action: 'send', phone: ownerPhone }),
  });
  const verified = await json('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ action: 'verify', phone: ownerPhone, code: '123456' }),
  });
  const cookie = verified.response.headers.get('set-cookie')?.split(';')[0] || '';
  assert.match(cookie, /^estate_session=/);
  const headers = {
    'Content-Type': 'application/json',
    Origin: base,
    Cookie: cookie,
  };
  await json('/api/workspace', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'onboarding',
      ownerPhone,
      consentConfirmed: true,
      contacts: [
        { phone: sharedBuyer, name: 'Shared buyer', consent: 'inbound-only' },
      ],
      properties: [property],
    }),
  });
  return { ownerPhone, headers };
}

const brokerA = await createBroker('61', {
  location: 'Sector 57, Gurugram',
  bedrooms: 2,
  sqft: 900,
  priceLakhs: 75,
});
const brokerB = await createBroker('62', {
  location: 'Sector 62, Gurugram',
  bedrooms: 3,
  sqft: 1200,
  priceLakhs: 95,
});

const workspaceA = (await json('/api/workspace', { headers: brokerA.headers })).result;
const workspaceB = (await json('/api/workspace', { headers: brokerB.headers })).result;
assert.deepEqual(workspaceA.state.contacts.map((item) => item.phone), [sharedBuyer]);
assert.deepEqual(workspaceB.state.contacts.map((item) => item.phone), [sharedBuyer]);
assert.equal(workspaceA.state.properties[0].location, 'Sector 57, Gurugram');
assert.equal(workspaceB.state.properties[0].location, 'Sector 62, Gurugram');

await json(
  '/api/whatsapp/cloud/test',
  {
    method: 'POST',
    headers: brokerA.headers,
    body: JSON.stringify({ phone: sharedBuyer, text: 'I need a 2 BHK under 80 lakh' }),
  },
  410,
);
await json(
  '/api/whatsapp/cloud/test',
  {
    method: 'POST',
    headers: brokerB.headers,
    body: JSON.stringify({ phone: sharedBuyer, text: 'I need a 3 BHK under 100 lakh' }),
  },
  410,
);

const afterA = (await json('/api/workspace', { headers: brokerA.headers })).result;
const afterB = (await json('/api/workspace', { headers: brokerB.headers })).result;
assert.equal(afterA.state.messages.length, 0);
assert.equal(afterB.state.messages.length, 0);
assert.deepEqual(afterA.state.leads.map((lead) => lead.phone), [sharedBuyer]);
assert.deepEqual(afterB.state.leads.map((lead) => lead.phone), [sharedBuyer]);
assert.equal(afterA.state.onboardingComplete, false);
assert.equal(afterB.state.onboardingComplete, false);
assert.equal(afterA.state.whatsapp.provider, 'openclaw');
assert.equal(afterB.state.whatsapp.provider, 'openclaw');
assert.equal(afterA.state.whatsapp.status, 'disconnected');
assert.equal(afterB.state.whatsapp.status, 'disconnected');

console.log(
  'PASS two brokers share a buyer phone without sharing CRM or listings, and simulation cannot create messages',
);
