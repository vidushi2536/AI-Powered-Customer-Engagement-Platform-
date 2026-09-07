import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'data/gurgaon-kaggle/RealEstate(gurgaon).csv');
const download = resolve(root, 'public/gurgaon-house-listings-kaggle.csv');
const output = resolve(root, 'data/properties.json');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const text = await readFile(source, 'utf8');
const [header, ...rows] = parseCsv(text);
const keys = header.map((key) => key.trim());
const records = rows.map((values, index) => ({
  sourceRow: index + 2,
  ...Object.fromEntries(keys.map((key, column) => [key, values[column]?.trim()])),
}));

const valid = records.filter((row) => {
  const numbers = ['sector', 'price', 'rate', 'area', 'bedRoom', 'bathroom'].map(
    (key) => Number(row[key]),
  );
  return (
    numbers.every(Number.isFinite) &&
    Number(row.price) > 0 &&
    Number(row.area) >= 250 &&
    Number(row.area) <= 15000 &&
    Number(row.bedRoom) >= 1 &&
    Number(row.bedRoom) <= 8
  );
});

// Keep the sample useful and deterministic: spread it across sectors and price bands.
const chosen = [];
const seen = new Map();
for (const row of valid) {
  const bucket = `${row.sector}:${row.bedRoom}`;
  const count = seen.get(bucket) ?? 0;
  if (count >= 2) continue;
  seen.set(bucket, count + 1);
  chosen.push(row);
  if (chosen.length === 120) break;
}

const properties = chosen.map((row, index) => ({
  id: `GGN-${String(row.sourceRow).padStart(4, '0')}`,
  location: `Sector ${row.sector}, Gurugram`,
  society: row.society && row.society.toLowerCase() !== 'nan' ? row.society : null,
  bedrooms: Number(row.bedRoom),
  sqft: Math.round(Number(row.area)),
  bathrooms: Number(row.bathroom),
  balconies: Number.isFinite(Number(row.balcony)) ? Number(row.balcony) : 0,
  priceLakhs: Math.round(Number(row.price) * 10000) / 100,
  ratePerSqft: Math.round(Number(row.rate)),
  areaType: row['F/H'] === '0' ? 'Independent house' : 'Apartment',
  source: 'Kaggle · Gurgaon historical sample',
  sourceRow: row.sourceRow,
  availability: 'Historical sample — verify current price and availability',
  image: index % 2 ? '/images/interior-warm.jpg' : '/images/interior-blue.jpg',
}));

await mkdir(dirname(download), { recursive: true });
await copyFile(source, download);
await writeFile(output, `${JSON.stringify(properties, null, 2)}\n`);
console.log(`Imported ${properties.length} Gurgaon listings from ${records.length} rows.`);
console.log(`Downloadable source: ${download}`);
