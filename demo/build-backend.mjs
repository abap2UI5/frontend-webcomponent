#!/usr/bin/env node
/*
 * Builds the demo backend: the sample classes in demo/abap/ transpiled
 * against @abap2ui5/node-runtime, the recipe of the package's README
 * ("Your own apps"), unchanged:
 *
 *   1. open-abap-core at the commit the runtime was built with
 *      (package.json abap2ui5.openAbapCore) -> demo/.deps/open-abap-core
 *      (OPEN_ABAP_CORE_DIR=<checkout at that commit> skips the git fetch)
 *   2. abap_transpile (the transpiler version the runtime names) of
 *      demo/abap -> demo/.build/output
 *   3. abap2ui5-own-apps demo/.build/output demo/.build/apps - the classes
 *      alone, their imports pointed at the runtime's own modules
 *
 * demo/server.mjs imports demo/.build/apps/index.mjs after the boot.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const runtimePkg = require('@abap2ui5/node-runtime/package.json');
const { transpiler, openAbapCore } = runtimePkg.abap2ui5;
const installed = require('@abaplint/transpiler-cli/package.json').version;
if (installed !== transpiler) {
  console.error(`build-backend: @abaplint/transpiler-cli ${installed} is installed, the runtime ${runtimePkg.version} was transpiled with ${transpiler} - pin that one`);
  process.exit(1);
}

const deps = path.join(ROOT, 'demo', '.deps', 'open-abap-core');
const build = path.join(ROOT, 'demo', '.build');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });

function headOf(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

if (headOf(deps) !== openAbapCore) {
  fs.rmSync(deps, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(deps), { recursive: true });
  const given = process.env.OPEN_ABAP_CORE_DIR;
  if (given) {
    if (headOf(given) !== openAbapCore && !fs.existsSync(path.join(given, 'src'))) {
      console.error(`build-backend: OPEN_ABAP_CORE_DIR=${given} is no open-abap-core checkout`);
      process.exit(1);
    }
    fs.cpSync(given, deps, { recursive: true });
  } else {
    run('git', ['init', '-q', deps]);
    run('git', ['-C', deps, 'fetch', '-q', '--depth', '1', 'https://github.com/open-abap/open-abap-core', openAbapCore]);
    run('git', ['-C', deps, 'checkout', '-q', 'FETCH_HEAD']);
  }
}

fs.rmSync(build, { recursive: true, force: true });
fs.mkdirSync(build, { recursive: true });
const config = {
  input_folder: 'demo/abap',
  output_folder: 'demo/.build/output',
  libs: [
    { folder: '/node_modules/@abap2ui5/node-runtime/downport', files: '/**/*.*' },
    { url: 'https://github.com/open-abap/open-abap-core', folder: '/demo/.deps/open-abap-core' },
  ],
  write_unit_tests: false,
  options: { ignoreSyntaxCheck: false, addFilenames: true, addCommonJS: true, unknownTypes: 'runtimeError' },
};
const configFile = path.join(build, 'abap_transpile.json');
fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
run(process.execPath, [path.join(path.dirname(require.resolve('@abaplint/transpiler-cli/package.json')), 'abap_transpile'), path.relative(ROOT, configFile)]);
const { ownApps } = await import('@abap2ui5/node-runtime/setup/own-apps.mjs');
const res = ownApps({ output: path.join(build, 'output'), apps: path.join(build, 'apps') });
fs.rmSync(path.join(build, 'output'), { recursive: true, force: true });
console.log(`build-backend: ${res.modules.length} app module(s) in demo/.build/apps for @abap2ui5/node-runtime ${runtimePkg.version}`);
