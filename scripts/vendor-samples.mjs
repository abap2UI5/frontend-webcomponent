#!/usr/bin/env node
/*
 * Copies the demo apps - real sample classes of abap2UI5/samples - into
 * demo/abap/, from a local checkout at one recorded COMMIT (read through
 * `git show <commit>:src/<file>`, so its working tree does not matter).
 * demo/abap/source.json records the repository, the commit and the sha256
 * of every file; test/unit/vendor.test.mjs fails on a hand edit.
 *
 *   node scripts/vendor-samples.mjs /path/to/samples [--ref <rev>]
 *
 * The class list is demo/apps.json (`classes`). The copies are byte-equal
 * to upstream: they are the apps an unchanged backend runs.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'demo', 'abap');
const args = process.argv.slice(2);
const local = args.find((a) => !a.startsWith('--'));
const refIdx = args.indexOf('--ref');
if (!local) {
  console.error('usage: node scripts/vendor-samples.mjs /path/to/samples [--ref <rev>]');
  process.exit(2);
}
const git = (a) => execFileSync('git', ['-C', local, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
const commit = git(['rev-parse', refIdx >= 0 ? args[refIdx + 1] : 'HEAD']).trim();
const { classes } = JSON.parse(fs.readFileSync(path.join(ROOT, 'demo', 'apps.json'), 'utf8'));
const names = [...new Set(classes.flatMap((c) => [c.class, ...(c.uses || [])]))].map((c) => c.toLowerCase()).sort();

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const files = {};
for (const name of names) {
  for (const ext of ['.clas.abap', '.clas.xml']) {
    const file = `${name}${ext}`;
    const text = git(['show', `${commit}:src/${file}`]);
    fs.writeFileSync(path.join(OUT, file), text);
    files[file] = createHash('sha256').update(text, 'utf8').digest('hex');
  }
}
const record = { repository: 'abap2UI5/samples', commit, files };
fs.writeFileSync(path.join(OUT, 'source.json'), `${JSON.stringify(record, null, 2)}\n`);
console.log(`vendor-samples: ${names.length} classes of abap2UI5/samples at ${commit.slice(0, 12)} -> demo/abap/`);
