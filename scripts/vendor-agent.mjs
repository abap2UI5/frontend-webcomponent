#!/usr/bin/env node
/*
 * Vendors the three pure protocol modules of abap2UI5/mcp-server into
 * src/vendor/agent/, unchanged, at one recorded COMMIT:
 *
 *   lib/viewxml.mjs    view XML, binding and event-wire parsers, the
 *                      expression evaluator (no eval)
 *   lib/snapshot.mjs   applyResponse (the view-slot and model bookkeeping
 *                      across roundtrips), getAt/setAt
 *   lib/appclient.mjs  buildDelta (the model delta the UI5 frontend sends),
 *                      errorText
 *
 * Why vendored and not a git dependency: the browser bundle needs three
 * files of a Node package whose dependencies (the MCP SDK, Playwright) it
 * must never pull in, and a git URL would make every `npm ci` clone the
 * whole server. The copies are byte-equal to upstream plus a header, so
 * the bundler tree-shakes what this frontend does not call (the agent
 * snapshot builder, createAppClient). A bump goes through this
 * repository's tests like any other change.
 *
 * src/vendor/agent/source.json records the commit and the sha256 of every
 * file; test/unit/vendor.test.mjs (offline) fails on a hand edit.
 *
 *   node scripts/vendor-agent.mjs /path/to/mcp-server [--ref <rev>]
 *   node scripts/vendor-agent.mjs --ref <sha>               (GitHub raw)
 *   node scripts/vendor-agent.mjs [/path/to/mcp-server] --check
 *        regenerates from the RECORDED commit in memory and fails when a
 *        committed copy differs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'abap2UI5/mcp-server';
const DIR = 'src/vendor/agent';
export const SOURCE_RECORD = `${DIR}/source.json`;
export const MODULES = {
  'lib/viewxml.mjs': `${DIR}/viewxml.mjs`,
  'lib/snapshot.mjs': `${DIR}/snapshot.mjs`,
  'lib/appclient.mjs': `${DIR}/appclient.mjs`,
};

export const header = (from, commit) => '/*\n'
  + ` * VENDORED - do not edit. ${REPO} ${from}\n`
  + ` * at commit ${commit}, copied unchanged by scripts/vendor-agent.mjs\n`
  + ' * (`npm run vendor`); `npm run vendor:check` and test/unit/vendor.test.mjs\n'
  + ' * fail when this copy drifts. Change it upstream, then re-vendor.\n'
  + ' */\n';
export const vendorModule = (text, from, commit) => header(from, commit) + text.replace(/\r\n/g, '\n');
export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function reader(local, commit) {
  if (local) {
    return async (file) => execFileSync('git', ['-C', local, 'show', `${commit}:${file}`], { encoding: 'utf8', maxBuffer: 64 << 20 });
  }
  return async (file) => {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${commit}/${file}`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    return res.text();
  };
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const refAt = args.indexOf('--ref');
  const ref = refAt >= 0 ? args[refAt + 1] : null;
  const local = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--ref') || null;
  const recorded = fs.existsSync(path.join(ROOT, SOURCE_RECORD)) ? JSON.parse(fs.readFileSync(path.join(ROOT, SOURCE_RECORD), 'utf8')) : null;
  let commit;
  if (check) {
    if (!recorded) throw new Error(`${SOURCE_RECORD} is missing`);
    commit = recorded.commit;
  } else if (local) {
    commit = execFileSync('git', ['-C', local, 'rev-parse', ref || 'HEAD'], { encoding: 'utf8' }).trim();
  } else if (ref && /^[0-9a-f]{40}$/.test(ref)) {
    commit = ref;
  } else {
    throw new Error('pass a local mcp-server checkout, or --ref <full sha>');
  }
  const read = reader(local, commit);
  const files = {};
  let drift = 0;
  for (const [from, to] of Object.entries(MODULES)) {
    const text = vendorModule(await read(from), from, commit);
    files[to] = sha256(text);
    const target = path.join(ROOT, to);
    if (check) {
      const have = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
      if (have !== text) {
        drift += 1;
        console.error(`vendor-agent: ${to} differs from ${REPO} ${from} at ${commit}`);
      }
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text);
    }
  }
  if (check) {
    if (drift) process.exit(1);
    console.log(`vendor-agent: ${Object.keys(MODULES).length} module(s) match ${REPO} at ${commit}`);
    return;
  }
  fs.writeFileSync(path.join(ROOT, SOURCE_RECORD), `${JSON.stringify({ repository: REPO, commit, files }, null, 2)}\n`);
  console.log(`vendor-agent: ${Object.keys(MODULES).length} module(s) of ${REPO} at ${commit} -> ${DIR}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`vendor-agent: ${e.message}`);
    process.exit(1);
  });
}
