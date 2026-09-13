// lib/campaigns.ts
//
// RECONSTRUCTED FILE. Imported by app/api/campaigns/route.ts and
// app/api/leads/[phone]/handoff/route.ts but never committed to the
// repository. The shape below was inferred from those call sites and the
// checked-in `public/property-template.csv`.
//
// CSV parsing and id helpers for the multi-campaign allowlist/property
// pipeline. Kept dependency-free (no D1 access) so it can be unit tested in
// isolation from the Workers runtime.

import { normalisePhone } from './domain';

/** `${prefix}_<12 hex chars>` - short, sortable-enough, collision-safe ids. */
export function newId(prefix: string): string {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${prefix}_${random}`;
}

export type ParsedContact = {
  phone: string;
};

export type ParsedProperty = {
  location: string;
  bedrooms: number;
  sizeSqft: number;
  price: number;
};

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function csvRows(csv: string): string[][] {
  return csv
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(splitCsvLine);
}

function looksLikeHeader(cells: string[], knownColumns: string[]): boolean {
  const normalised = cells.map((c) => c.toLowerCase().replace(/[\s_]/g, ''));
  return normalised.some((c) => knownColumns.includes(c));
}

/**
 * Accepts either a bare list of phone numbers (one per line, optionally
 * with a header row) or a `phone[,name]` CSV. Invalid or duplicate numbers
 * are silently skipped - the caller reports the resulting count so the
 * manager can sanity-check it against the source file.
 */
export function parseContactsCsv(csv: string): ParsedContact[] {
  const rows = csvRows(csv);
  if (!rows.length) return [];

  let dataRows = rows;
  let phoneIndex = 0;
  const first = rows[0];
  if (looksLikeHeader(first, ['phone', 'phonenumber', 'mobile', 'contact'])) {
    const normalisedHeader = first.map((c) => c.toLowerCase().replace(/[\s_]/g, ''));
    const found = normalisedHeader.findIndex((c) =>
      ['phone', 'phonenumber', 'mobile', 'contact'].includes(c),
    );
    phoneIndex = found === -1 ? 0 : found;
    dataRows = rows.slice(1);
  }

  const seen = new Set<string>();
  const contacts: ParsedContact[] = [];
  for (const row of dataRows) {
    const raw = row[phoneIndex];
    if (!raw) continue;
    const phone = normalisePhone(raw);
    if (!/^\+\d{8,15}$/.test(phone)) continue;
    if (seen.has(phone)) continue;
    seen.add(phone);
    contacts.push({ phone });
  }
  return contacts;
}

const PROPERTY_COLUMN_ALIASES: Record<string, keyof ParsedProperty> = {
  location: 'location',
  address: 'location',
  city: 'location',
  bedrooms: 'bedrooms',
  bhk: 'bedrooms',
  sqft: 'sizeSqft',
  sizesqft: 'sizeSqft',
  area: 'sizeSqft',
  price: 'price',
  pricelakhs: 'price',
  priceinr: 'price',
};

/**
 * Parses a property CSV such as `public/property-template.csv`
 * (`location,bedrooms,sqft,price_lakhs`). Throws on a missing required
 * column so the manager sees a clear rejection instead of a silently empty
 * import; individual malformed data rows are skipped.
 */
export function parsePropertiesCsv(csv: string): ParsedProperty[] {
  const rows = csvRows(csv);
  if (!rows.length) throw new Error('propertiesCsv has no rows');

  const header = rows[0].map((c) => c.toLowerCase().replace(/[\s_]/g, ''));
  const columnMap: Partial<Record<keyof ParsedProperty, number>> = {};
  header.forEach((cell, index) => {
    const field = PROPERTY_COLUMN_ALIASES[cell];
    if (field && columnMap[field] === undefined) columnMap[field] = index;
  });

  const required: (keyof ParsedProperty)[] = ['location', 'bedrooms', 'sizeSqft', 'price'];
  const missing = required.filter((field) => columnMap[field] === undefined);
  if (missing.length) {
    throw new Error(`propertiesCsv is missing required column(s): ${missing.join(', ')}`);
  }

  const properties: ParsedProperty[] = [];
  for (const row of rows.slice(1)) {
    const location = row[columnMap.location!]?.trim();
    const bedrooms = Number(row[columnMap.bedrooms!]);
    const sizeSqft = Number(row[columnMap.sizeSqft!]);
    const price = Number(row[columnMap.price!]);
    if (!location) continue;
    if (![bedrooms, sizeSqft, price].every((n) => Number.isFinite(n) && n > 0)) continue;
    properties.push({ location, bedrooms, sizeSqft, price });
  }
  return properties;
}
