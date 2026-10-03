#!/usr/bin/env node
/*
 * Copies the portable profile's machine-readable control list
 * (abap2UI5/protocol `profiles/portable-v1.json`) into profile/, unchanged,
 * from a local protocol checkout at one recorded COMMIT (read through
 * `git show <commit>:<file>`, so its working tree does not matter).
 * profile/source.json records the repository, the commit and the sha256;
 * test/unit/vendor.test.mjs fails on a hand edit.
 *
 *   node scripts/vendor-profile.mjs /path/to/protocol [--ref <rev>]   (default: origin/main)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'profiles/portable-v1.json';
const args = process.argv.slice(2);
const local = args.find((a) => !a.startsWith('--'));
const refIdx = args.indexOf('--ref');
if (!local) {
  console.error('usage: node scripts/vendor-profile.mjs /path/to/protocol [--ref <rev>]');
  process.exit(2);
}
const git = (a) => execFileSync('git', ['-C', local, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
const ref = refIdx >= 0 ? args[refIdx + 1] : 'origin/main';
const commit = git(['rev-parse', `${ref}^{commit}`]).trim();
const text = git(['show', `${commit}:${FILE}`]);
JSON.parse(text);
fs.writeFileSync(path.join(ROOT, 'profile', 'portable-v1.json'), text);
const record = {
  repository: 'abap2UI5/protocol',
  path: FILE,
  commit,
  note: `copied unchanged by scripts/vendor-profile.mjs from ${ref}; re-copy when the protocol repository changes the profile`,
  sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
};
fs.writeFileSync(path.join(ROOT, 'profile', 'source.json'), `${JSON.stringify(record, null, 2)}\n`);
console.log(`vendor-profile: ${FILE} @ ${commit.slice(0, 7)} (${ref})`);
