/* The vendored files are byte-equal to what their source.json records. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const sha = (f) => createHash('sha256').update(fs.readFileSync(f, 'utf8'), 'utf8').digest('hex');

test('src/vendor/agent matches its recorded mcp-server commit', () => {
  const rec = JSON.parse(fs.readFileSync('src/vendor/agent/source.json', 'utf8'));
  assert.match(rec.commit, /^[0-9a-f]{40}$/);
  for (const [file, hash] of Object.entries(rec.files)) {
    assert.equal(sha(file), hash, `${file} was edited by hand - change it upstream and run npm run vendor`);
    assert.match(fs.readFileSync(file, "utf8"), new RegExp(`VENDORED - do not edit\\. abap2UI5/mcp-server [^\\n]*\\n \\* at commit ${rec.commit}`));
  }
});

test('demo/abap holds the recorded sample classes unchanged', () => {
  const rec = JSON.parse(fs.readFileSync('demo/abap/source.json', 'utf8'));
  const apps = JSON.parse(fs.readFileSync('demo/apps.json', 'utf8')).classes;
  for (const [file, hash] of Object.entries(rec.files)) assert.equal(sha(`demo/abap/${file}`), hash, file);
  for (const a of apps) {
    for (const c of [a.class, ...(a.uses || [])]) assert.ok(rec.files[`${c.toLowerCase()}.clas.abap`], `${c} is not vendored`);
  }
});

test('profile/portable-v1.json matches its recorded sha', () => {
  const rec = JSON.parse(fs.readFileSync('profile/source.json', 'utf8'));
  assert.equal(sha('profile/portable-v1.json'), rec.sha256);
});

test('the README coverage table is up to date', async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['scripts/generate-coverage.mjs', '--check'], { stdio: 'pipe' });
});
