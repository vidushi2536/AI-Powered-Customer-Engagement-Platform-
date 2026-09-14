import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const integrationRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(integrationRoot);
const runtimeRoot = process.env.OPENCLAW_RUNTIME_ROOT || dirname(repositoryRoot);
const ownerPhone = normalize(
  process.argv.find((value) => /^\+?\d[\d\s()-]{8,}$/.test(value)) ||
    process.env.OPENCLAW_OWNER_PHONE,
);
const watch = process.argv.includes('--watch');
const dashboard = process.env.ESTATE_DESK_URL || 'http://localhost:3000';
const intervalMs = Math.max(
  500,
  Number(process.env.ESTATE_DESK_SYNC_INTERVAL_MS || 1000),
);
const varsPath =
  process.env.ESTATE_DESK_VARS_PATH ||
  [
    join(runtimeRoot, 'estate-desk', '.dev.vars'),
    join(repositoryRoot, 'code', 'estate-desk', '.dev.vars'),
  ].find((candidate) => existsSync(candidate)) ||
  join(repositoryRoot, 'code', 'estate-desk', '.dev.vars');
const configPath = resolve(
  process.env.OPENCLAW_CONFIG_PATH ||
    join(runtimeRoot, 'lawbstah-home', 'openclaw.json'),
);
const catalogPath = resolve(
  process.env.OPENCLAW_ESTATE_WORKSPACE_PATH ||
    join(runtimeRoot, 'lawbstah-workspace-estate-desk', 'AGENTS.md'),
);

function normalize(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function localSecret() {
  const lines = existsSync(varsPath) ? readFileSync(varsPath, 'utf8').split(/\r?\n/) : [];
  const line = lines.find((value) => value.startsWith('WHATSAPP_SYNC_SECRET='));
  return process.env.ESTATE_DESK_SYNC_SECRET || line?.slice(line.indexOf('=') + 1).trim();
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function writeCatalog(properties) {
  const current = readFileSync(catalogPath, 'utf8');
  const heading = '# Active property catalog';
  const prefix = current.includes('# Gurgaon sample catalog')
    ? current.slice(0, current.indexOf('# Gurgaon sample catalog'))
    : current.includes(heading)
      ? current.slice(0, current.indexOf(heading))
      : `${current.trim()}\n\n`;
  const records = properties.map(
    (property) =>
      `- ${property.id} | ${property.bedrooms} BHK | ${property.location} | ${property.sqft} sq ft | ₹${property.priceLakhs} lakh | ${property.availability}`,
  );
  const next = `${prefix}${heading}\n\n${records.join('\n')}\n`;
  if (next !== current) writeFileSync(catalogPath, next, 'utf8');
}

function writeOpenClawConfig(phones) {
  const currentText = readFileSync(configPath, 'utf8');
  const config = JSON.parse(currentText);
  const priorAllowFrom = config.channels?.whatsapp?.allowFrom || [];
  const priorAccountAllowFrom =
    config.channels?.whatsapp?.accounts?.shellsworth?.allowFrom || [];
  const existingBindings = Array.isArray(config.bindings) ? config.bindings : [];
  const retained = existingBindings.filter(
    (binding) =>
      !(
        binding?.match?.channel === 'whatsapp' &&
        binding?.match?.accountId === 'shellsworth'
      ),
  );
  const estateDeskRoute = {
    type: 'route',
    agentId: 'estate-desk',
    match: {
      channel: 'whatsapp',
      accountId: 'shellsworth',
    },
  };
  const bindings = [estateDeskRoute, ...retained];
  if (
    sameJson(priorAllowFrom, phones) &&
    sameJson(priorAccountAllowFrom, phones) &&
    sameJson(existingBindings, bindings)
  )
    return false;
  config.channels ||= {};
  config.channels.whatsapp ||= {};
  config.channels.whatsapp.accounts ||= {};
  config.channels.whatsapp.accounts.shellsworth ||= {};
  config.channels.whatsapp.dmPolicy = 'allowlist';
  config.channels.whatsapp.allowFrom = phones;
  config.channels.whatsapp.accounts.shellsworth.dmPolicy = 'allowlist';
  config.channels.whatsapp.accounts.shellsworth.allowFrom = phones;
  if (!existsSync(`${configPath}.estate-desk-backup`))
    copyFileSync(configPath, `${configPath}.estate-desk-backup`);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return true;
}

let lastFingerprint = '';
let lastProblem = '';

async function synchronize() {
  try {
    if (!/^\+\d{10,15}$/.test(ownerPhone))
      throw new Error('Pass the linked WhatsApp owner number, including country code.');
    const secret = localSecret();
    if (!secret) throw new Error('WHATSAPP_SYNC_SECRET is not configured.');
    const url = new URL('/api/openclaw/context', dashboard);
    url.searchParams.set('ownerPhone', ownerPhone);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(5000),
    });
    const context = await response.json();
    if (!response.ok) throw new Error(context.error || `Dashboard returned ${response.status}.`);
    const phones = [...new Set(context.contacts.map((contact) => normalize(contact.phone)))].filter(
      (phone) => /^\+\d{10,15}$/.test(phone),
    );
    if (!phones.length) throw new Error('Waiting for this owner to finish CRM onboarding.');
    const fingerprint = JSON.stringify([phones, context.properties]);
    writeCatalog(context.properties);
    const configChanged = writeOpenClawConfig(phones);
    if (configChanged) {
      const restarted = spawnSync('docker', ['compose', 'restart', 'openclaw-gateway'], {
        cwd: runtimeRoot,
        stdio: 'inherit',
      });
      if (restarted.status !== 0) throw new Error('OpenClaw restart failed.');
    }
    const dataChanged = fingerprint !== lastFingerprint;
    lastFingerprint = fingerprint;
    lastProblem = '';
    if (dataChanged || configChanged)
      console.log(
        `[estate-desk-crm] synchronized ${phones.length} CRM contact(s) and ${context.properties.length} listing(s) for ${ownerPhone}`,
      );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Synchronization failed.';
    if (message !== lastProblem) console.warn(`[estate-desk-crm] ${message}`);
    lastProblem = message;
    if (!watch) process.exitCode = 1;
  }
}

await synchronize();
if (watch) setInterval(() => void synchronize(), intervalMs);
