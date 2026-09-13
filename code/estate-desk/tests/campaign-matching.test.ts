import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Node's built-in TypeScript runner requires the explicit extension.
import { matchProperties, type CampaignProperty } from '../lib/matching.ts';
// @ts-ignore
import { extractRequirements, isExtractionUsable } from '../lib/requirements.ts';

function property(overrides: Partial<CampaignProperty>): CampaignProperty {
  return {
    id: 'prop_1',
    address: '1 Example St',
    location: 'Downtown',
    price: 2000,
    bedrooms: 2,
    sizeSqft: 900,
    propertyType: 'apartment',
    isHot: 0,
    demandScore: 0.2,
    ...overrides,
  };
}

test('exact location and room match scores higher than a partial match', () => {
  const requirements = extractRequirements([
    { id: 'm1', direction: 'inbound', body: 'Looking for a 2 bedroom apartment near Downtown, budget under 2500.' },
  ]);
  const exact = property({ id: 'exact', location: 'Downtown', bedrooms: 2, price: 2300 });
  const partial = property({ id: 'partial', location: 'Uptown', bedrooms: 2, price: 2300 });
  const results = matchProperties(requirements, [exact, partial]);
  assert.equal(results[0].propertyId, 'exact');
  assert.ok(results[0].score > (results.find((r) => r.propertyId === 'partial')?.score ?? Infinity));
});

test('over-budget properties are excluded even when hot', () => {
  const requirements = extractRequirements([
    { id: 'm1', direction: 'inbound', body: 'Need a 2 bedroom under 2000 per month.' },
  ]);
  const overBudgetHot = property({ id: 'hot', price: 5000, isHot: 1, demandScore: 0.95, bedrooms: 2 });
  const inBudget = property({ id: 'ok', price: 1800, bedrooms: 2 });
  const results = matchProperties(requirements, [overBudgetHot, inBudget]);
  assert.ok(!results.some((r) => r.propertyId === 'hot'));
  assert.ok(results.some((r) => r.propertyId === 'ok'));
});

test('fewer bedrooms than requested is a hard fail, not a soft penalty', () => {
  const requirements = extractRequirements([
    { id: 'm1', direction: 'inbound', body: 'Need a 3 bedroom apartment.' },
  ]);
  const tooSmall = property({ id: 'small', bedrooms: 1 });
  const bigger = property({ id: 'bigger', bedrooms: 4 });
  const results = matchProperties(requirements, [tooSmall, bigger]);
  assert.ok(!results.some((r) => r.propertyId === 'small'));
  assert.ok(results.some((r) => r.propertyId === 'bigger'));
});

test('never returns more than five matches', () => {
  const requirements = extractRequirements([{ id: 'm1', direction: 'inbound', body: 'Any 2 bedroom place.' }]);
  const properties = Array.from({ length: 12 }, (_, i) => property({ id: `p${i}`, price: 1000 + i }));
  const results = matchProperties(requirements, properties);
  assert.ok(results.length <= 5);
});

test('every match carries at least one human-readable reason', () => {
  const requirements = extractRequirements([
    { id: 'm1', direction: 'inbound', body: 'Need a 2 bedroom near Downtown under 3000.' },
  ]);
  const results = matchProperties(requirements, [property({ id: 'p1', location: 'Downtown', bedrooms: 2, price: 2500 })]);
  assert.ok(results[0].matchReasons.length > 0);
});

test('with no eligible property, best partial matches are returned with unmet requirements listed', () => {
  const requirements = extractRequirements([
    { id: 'm1', direction: 'inbound', body: 'Need a 4 bedroom house under 1000.' },
  ]);
  const results = matchProperties(requirements, [property({ id: 'p1', bedrooms: 2, price: 2000 })]);
  assert.equal(results.length, 1);
  assert.ok(results[0].unmetRequirements.length > 0);
});

test('extracts bedrooms, budget, location and required amenities', () => {
  const extracted = extractRequirements([
    {
      id: 'm1',
      direction: 'inbound',
      body: 'Looking to rent a 2 bedroom apartment near Downtown. Parking is essential, under 2500.',
    },
  ]);
  assert.equal(extracted.roomsNeeded, 2);
  assert.equal(extracted.budgetMax, 2500);
  assert.ok(extracted.preferredLocations.some((l) => /downtown/i.test(l)));
  assert.ok(extracted.requiredFeatures.includes('parking'));
});

test('missing fields are identified rather than guessed', () => {
  const extracted = extractRequirements([{ id: 'm1', direction: 'inbound', body: 'Hi, is anyone there?' }]);
  assert.equal(extracted.roomsNeeded, null);
  assert.ok(extracted.missingFields.includes('rooms_needed'));
  assert.equal(isExtractionUsable(extracted), false);
});

test('outbound messages are never used as extraction evidence', () => {
  const extracted = extractRequirements([
    { id: 'm1', direction: 'outbound', body: '3 bedroom apartment near Riverside under 4000' },
  ]);
  assert.equal(extracted.roomsNeeded, null);
  assert.deepEqual(extracted.sourceMessageIds, []);
});
