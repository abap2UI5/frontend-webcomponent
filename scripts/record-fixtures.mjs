#!/usr/bin/env node
/*
 * Records the start response of every demo app (demo/apps.json) from the
 * demo backend, in process, into test/fixtures/views/<class>.json - the
 * real views the renderer unit tests render without a browser.
 *
 *   npm run demo:build && node scripts/record-fixtures.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { initialize, createApp } from '@abap2ui5/node-runtime';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
await initialize();
await import(pathToFileURL(path.join(ROOT, 'demo', '.build', 'apps', 'index.mjs')).href);
const app = express();
app.use('/sap/bc/z2ui5', await createApp());
const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const out = path.join(ROOT, 'test', 'fixtures', 'views');
fs.mkdirSync(out, { recursive: true });
const { classes } = JSON.parse(fs.readFileSync(path.join(ROOT, 'demo', 'apps.json'), 'utf8'));
for (const { class: cls } of classes) {
  const res = await fetch(`${base}/sap/bc/z2ui5/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: { S_FRONT: { ORIGIN: base, PATHNAME: '/sap/bc/z2ui5/', SEARCH: `?app_start=${cls}` } } }),
  });
  const json = await res.json();
  // the draft id differs per run - keep the files stable
  json.S_FRONT.ID = 'FIXTURE';
  fs.writeFileSync(path.join(out, `${cls.toLowerCase()}.json`), `${JSON.stringify(json, null, 1)}\n`);
}
server.close();
console.log(`record-fixtures: ${classes.length} start responses -> test/fixtures/views/`);
process.exit(0);
