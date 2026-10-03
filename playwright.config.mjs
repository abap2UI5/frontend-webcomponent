import { defineConfig } from '@playwright/test';
import fs from 'node:fs';

/*
 * The e2e tests run both frontends against ONE backend: demo/server.mjs
 * (@abap2ui5/node-runtime + the demo apps). Run `npm run demo:build` and
 * `npm run build` first.
 *
 * Chromium: CHROMIUM_BIN, else the sandbox's /opt/pw-browsers/chromium,
 * else Playwright's own (`npx playwright install chromium` in CI).
 */
const PORT = Number(process.env.E2E_PORT || 4300);
const local = ['/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
const executablePath = process.env.CHROMIUM_BIN || local;

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // one worker: the tests share ONE backend process, and the transpiled
  // framework keeps per-request state in static attributes - two requests
  // interleaving at an await read each other's (seen as wrong app data)
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 800 },
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node demo/server.mjs --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
