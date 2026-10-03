#!/usr/bin/env node
/*
 * After `vite build`: copies the standalone page and the plain-HTML embedding
 * example into dist/ and reports the
 * bundle sizes (raw and gzip) - the main bundle and the on-demand chunks.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(ROOT, 'dist');
fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(dist, 'index.html'));
fs.mkdirSync(path.join(dist, 'examples'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'examples', 'plain.html'), path.join(dist, 'examples', 'plain.html'));
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const files = [];
const walk = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
};
walk(dist);
let total = 0;
let totalGz = 0;
const rows = files.map((f) => {
  const buf = fs.readFileSync(f);
  const gz = zlib.gzipSync(buf).length;
  total += buf.length;
  totalGz += gz;
  return { file: path.relative(dist, f), raw: buf.length, gz };
}).sort((a, b) => b.raw - a.raw);
const main = rows.find((r) => r.file === 'abap2ui5-wc.js');
console.log(`abap2ui5-wc.js (loaded up front): ${kb(main.raw)} raw, ${kb(main.gz)} gzip`);
const big = rows.filter((r) => r !== main).slice(0, 5);
for (const r of big) console.log(`  on demand ${r.file}: ${kb(r.raw)} raw, ${kb(r.gz)} gzip`);
console.log(`all ${rows.length} JS files: ${kb(total)} raw, ${kb(totalGz)} gzip`);
fs.writeFileSync(path.join(dist, 'size.json'), JSON.stringify({ main, files: rows.length, total, totalGz }, null, 2));
