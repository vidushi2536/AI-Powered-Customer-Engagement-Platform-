import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CircleAlert, ShieldCheck } from 'lucide-react';
import { chromium } from '/opt/browser/node_modules/playwright/index.mjs';
import { fixture } from './ui-fixture.mjs';
const source = await fs.readFile('app/workspace-app.tsx', 'utf8');
const ast = ts.createSourceFile('workspace-app.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['ViewingDesk', 'formatViewingStatus', 'safeMeetingDate', 'EmptyState'];
const functions = ast.statements.filter(statement => ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text));
assert.equal(functions.length, names.length);
const code = ts.transpileModule(functions.map(statement => statement.getText(ast)).join('\n'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const Meetings = new Function('React', 'useState', 'CircleAlert', 'ShieldCheck', `${code}; return ViewingDesk;`)(React, React.useState, CircleAlert, ShieldCheck);
const css = (await fs.readFile('app/globals.css', 'utf8')).replace(/^@import[^;]+;/gm, '');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [];
await fs.mkdir('artifacts/meeting-smoke', { recursive: true });
try {
  for (const width of [320, 1440]) {
    for (const empty of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await page.route('**/*', route => route.abort());
      const html = renderToStaticMarkup(React.createElement(Meetings, { state: fixture(empty).state,
        post: async () => { throw new Error('No mutations permitted in isolated test'); } }));
      await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><main class="manager-shell section-meetings">${html}</main>`);
      assert.equal(await page.getByRole('heading', { name: 'All meetings', exact: true }).count(), 1);
      if (empty) {
        assert.equal(await page.getByRole('heading', { name: 'No property visits yet', exact: true }).count(), 1);
      } else {
        assert.equal(await page.getByRole('heading', { name: 'Synthetic Ready Client', exact: true }).count(), 1);
        assert.equal(await page.locator('.viewing-label.proposed').innerText(), 'Proposed');
        assert.equal(await page.locator('form.scheduler-card label:first-of-type select').count(), 1);
        const options = await page.locator('form.scheduler-card label:first-of-type select option').allTextContents();
        assert.equal(options.some(option => option.includes('Opted Out')), false);
        assert.equal(await page.getByRole('button', { name: 'Confirmed', exact: true }).count(), 1);
      }
      assert.equal(await page.locator('form.scheduler-card label:nth-of-type(2) select').count(), 1);
      const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(pageOverflow, false);
      const state = empty ? 'empty' : 'proposed';
      await page.screenshot({ path: `artifacts/meeting-smoke/${state}-${width}.png`, fullPage: true });
      results.push({ width, state, pageOverflow, passed: true });
      await page.close();
    }
  }
} finally { await browser.close(); }
await fs.writeFile('artifacts/meeting-smoke/results.json', JSON.stringify({
  scope: 'Isolated production ViewingDesk rendering only. No application runtime, interactive readiness, loading/error verification, preview or independent Feedback.', results }, null, 2));
console.log('PASS isolated meeting proposed/empty renders at 320, 1440px; proposal label, opted-out exclusion and unique form selectors. Runtime/error/loading checks remain blocked.');
