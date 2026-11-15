import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import { chromium } from '/opt/browser/node_modules/playwright/index.mjs';
import { fixture } from './ui-fixture.mjs';

const source = await fs.readFile('app/workspace-app.tsx', 'utf8');
const ast = ts.createSourceFile('workspace-app.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['TrendsDashboard', 'DemandBars', 'price'];
const functions = ast.statements.filter(statement => ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text));
assert.equal(functions.length, names.length);
const code = ts.transpileModule(functions.map(statement => statement.getText(ast)).join('\n'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const iconNames = ['BarChart3', 'Building2', 'MessageCircle', 'ShieldCheck', 'Sparkles'];
const Dashboard = new Function('React', ...iconNames, `${code}; return TrendsDashboard;`)(React, ...iconNames.map(name => icons[name]));
const css = (await fs.readFile('app/globals.css', 'utf8')).replace(/^@import[^;]+;/gm, '');
const payload = fixture();
const html = renderToStaticMarkup(React.createElement(Dashboard, { insights: payload.insights }));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [];
await fs.mkdir('artifacts/table-smoke', { recursive: true });
try {
  for (const width of [320, 360, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await page.route('**/*', route => route.abort());
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><main class="manager-shell section-properties"><section class="property-insights-first">${html}</section></main>`);
    const region = page.getByRole('region', { name: 'Buyer interest by property, scroll horizontally for all fields', exact: true });
    const table = page.getByRole('table', { name: 'Buyer interest by property', exact: true });
    assert.equal(await region.count(), 1);
    assert.equal(await table.count(), 1);
    const metrics = await region.evaluate(element => ({ regionWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      tableWidth: element.querySelector('table').offsetWidth,
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      textClipped: [...element.querySelectorAll('td')].some(cell => cell.scrollWidth > cell.clientWidth + 1),
      primaryFields: [...element.querySelectorAll('tbody tr:first-child td')].slice(0, 3).map(cell => cell.textContent) }));
    assert.equal(metrics.pageOverflow, false, `page overflow at ${width}`);
    assert.ok(metrics.tableWidth >= 720, `readable column widths at ${width}`);
    assert.equal(metrics.textClipped, false, `clipped cells at ${width}`);
    assert.match(metrics.primaryFields[0], /Synthetic Riverside/);
    assert.match(metrics.primaryFields[1], /North residential extension/);
    assert.ok(metrics.primaryFields[2].length);
    await region.focus();
    for (const column of [0, 1, 2]) {
      const cell = table.locator('tbody tr:first-child td').nth(column);
      await cell.evaluate(element => element.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
      const bounds = await cell.boundingBox();
      const viewport = await region.boundingBox();
      assert.ok(bounds.x >= viewport.x - 1 && bounds.x + bounds.width <= viewport.x + viewport.width + 1,
        `primary column ${column} reachable at ${width}`);
      if (width === 320) {
        await region.screenshot({ path: `artifacts/table-smoke/primary-${column}-320.png` });
      }
    }
    if (width < 720) {
      assert.ok(metrics.scrollWidth > metrics.regionWidth);
      await page.keyboard.press('End');
      await region.evaluate(element => { element.scrollLeft = element.scrollWidth; });
      assert.ok(await region.evaluate(element => element.scrollLeft > 0));
    }
    await region.evaluate(element => { element.scrollLeft = 0; });
    await region.screenshot({ path: `artifacts/table-smoke/table-${width}.png` });
    results.push({ width, ...metrics, passed: true });
    await page.close();
  }
} finally { await browser.close(); }
await fs.writeFile('artifacts/table-smoke/results.json', JSON.stringify({ scope: 'Isolated production TrendsDashboard render with synthetic state. Not full application runtime, preview or independent Feedback.', results }, null, 2));
console.log(`PASS isolated production buyer-interest table at ${results.map(item => item.width).join(', ')}px: no page overflow or clipped primary fields; keyboard-focusable bounded scroll.`);
