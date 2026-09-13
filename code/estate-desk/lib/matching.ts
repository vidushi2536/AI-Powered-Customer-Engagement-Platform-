// lib/matching.ts
//
// Deterministic property matching service (Parts 8-9 of the implementation
// spec). Reads structured requirements and the campaign's property
// inventory, applies hard filters, scores the remainder, and returns at
// most five ranked matches with human-readable reasons. Ranking is never
// delegated to an LLM, and a hot-property bonus can never override a hard
// requirement (e.g. an over-budget or wrong-bedroom-count listing is
// excluded regardless of demand).

import type { ExtractedRequirements } from './requirements';

export type CampaignProperty = {
  id: string;
  address: string;
  location: string;
  price: number;
  bedrooms: number;
  sizeSqft: number;
  propertyType: string | null;
  isHot: number; // 0 | 1, from the properties table
  demandScore: number; // 0..1
};

export type PropertyMatch = {
  propertyId: string;
  rank: number;
  score: number;
  isHot: boolean;
  matchReasons: string[];
  unmetRequirements: string[];
};

type ScoredCandidate = PropertyMatch & { hardFail: boolean };

function isHotProperty(property: CampaignProperty): boolean {
  // Hot status comes from property data / deterministic business rules
  // only - never from conversation wording.
  return property.isHot === 1 || property.demandScore >= 0.75;
}

function scoreProperty(
  requirements: ExtractedRequirements,
  property: CampaignProperty,
): ScoredCandidate {
  let score = 0;
  const matchReasons: string[] = [];
  const unmetRequirements: string[] = [];
  let hardFail = false;

  if (requirements.budgetMax != null) {
    if (property.price > requirements.budgetMax) {
      hardFail = true;
      unmetRequirements.push('Over the stated budget');
    } else {
      score += 20;
      matchReasons.push('Within the stated budget');
      if (property.price <= requirements.budgetMax * 0.85) score += 10;
    }
  }

  if (requirements.roomsNeeded != null) {
    if (property.bedrooms === requirements.roomsNeeded) {
      score += 25;
      matchReasons.push(`Exact ${property.bedrooms}-bedroom match`);
    } else if (property.bedrooms > requirements.roomsNeeded) {
      score += 10;
      matchReasons.push('More bedrooms than requested');
    } else {
      hardFail = true;
      unmetRequirements.push('Fewer bedrooms than requested');
    }
  }

  if (requirements.preferredLocations.length) {
    const matched = requirements.preferredLocations.some((loc) =>
      property.location.toLowerCase().includes(loc.toLowerCase()),
    );
    if (matched) {
      score += 30;
      matchReasons.push('Located in a preferred area');
    } else {
      unmetRequirements.push('Not in a stated preferred area');
    }
  }

  if (requirements.propertyType && property.propertyType) {
    if (property.propertyType.toLowerCase() === requirements.propertyType.toLowerCase()) {
      score += 15;
      matchReasons.push('Property type matches');
    } else {
      unmetRequirements.push('Different property type than requested');
    }
  }

  const hot = isHotProperty(property);
  if (hot) {
    score += 10;
    matchReasons.push('High current demand');
  }
  score += Math.max(0, Math.min(10, property.demandScore * 10));

  return {
    propertyId: property.id,
    rank: 0,
    score,
    isHot: hot,
    matchReasons,
    unmetRequirements,
    hardFail,
  };
}

/**
 * Returns at most five properties ranked by score, highest first. Hard
 * requirement violations (over budget, too few bedrooms) exclude a
 * property outright; everything else is a scored, explainable soft match.
 * If no property survives the hard filters, the best-scoring partial
 * matches (still capped at five) are returned with their unmet
 * requirements listed, so the caller can present them as partial rather
 * than exact matches - never silently as exact matches.
 */
export function matchProperties(
  requirements: ExtractedRequirements,
  properties: CampaignProperty[],
): PropertyMatch[] {
  const scored = properties.map((p) => scoreProperty(requirements, p));
  const eligible = scored.filter((m) => !m.hardFail);
  const pool = eligible.length > 0 ? eligible : scored;
  return pool
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((m, index) => ({
      propertyId: m.propertyId,
      rank: index + 1,
      score: Math.round(m.score),
      isHot: m.isHot,
      matchReasons: m.matchReasons,
      unmetRequirements: m.unmetRequirements,
    }));
}
