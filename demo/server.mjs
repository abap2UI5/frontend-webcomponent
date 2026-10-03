#!/usr/bin/env node
/*
 * The demo server: ONE abap2UI5 backend (@abap2ui5/node-runtime, the demo
 * apps of demo/abap loaded on top) and the two frontends in front of it.
 *
 *   /sap/bc/z2ui5/            the backend - POST is the protocol; a GET
 *                             answers the official UI5 SPA of the same
 *                             release (the cross-check in test/e2e)
 *   /                         the web-components frontend: dist/ (index.html,
 *                             abap2ui5-wc.js and its chunks)
 *   /examples/plain.html      the embedding example (copied into dist/ by the build)
 *
 *   node demo/server.mjs [--port 4300] [--host 127.0.0.1]
 *
 * PORT / HOST from the environment work too. Run `npm run demo:build`
 * (the backend) and `npm run build` (the bundle) first.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initialize, createApp } from '@abap2ui5/node-runtime';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const port = Number(arg('port') || process.env.PORT || 4300);
const host = arg('host') || process.env.HOST || '127.0.0.1';

const apps = path.join(ROOT, 'demo', '.build', 'apps', 'index.mjs');
if (!fs.existsSync(apps)) {
  console.error('demo/server: demo/.build/apps is missing - run `npm run demo:build` first');
  process.exit(1);
}
await initialize();
await import(pathToFileURL(apps).href);

const app = express();
app.use('/sap/bc/z2ui5', await createApp());
app.use('/', express.static(path.join(ROOT, 'dist')));
const server = app.listen(port, host, () => {
  console.log(`demo/server: http://${host}:${port}/?app_start=Z2UI5_CL_SMP_APP_493  (web components)`);
  console.log(`demo/server: http://${host}:${port}/sap/bc/z2ui5/?app_start=Z2UI5_CL_SMP_APP_493  (UI5 SPA)`);
});
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
