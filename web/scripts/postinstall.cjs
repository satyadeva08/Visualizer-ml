#!/usr/bin/env node
/**
 * VISUALISER — postinstall helper (CommonJS on purpose: package.json has "type": "module",
 * so a .js file here would be treated as ES module and `require` would crash).
 *
 * PURPOSE
 *   On Windows-on-ARM (Snapdragon X) with Application Control, Rollup's native
 *   binary (.node) can be blocked. package.json already aliases `rollup` to the
 *   pure-WASM build via "overrides", which fixes it for most setups. This script
 *   is a SAFETY NET and only acts when ALL are true:
 *     - platform is win32 and architecture is arm64
 *     - node_modules/rollup is the NATIVE rollup package (not the WASM alias)
 *     - @rollup/wasm-node is installed
 *   On every other machine it does nothing and exits 0 (it must never break `npm install`).
 */
const fs = require('fs');
const path = require('path');

function main() {
  if (!(process.platform === 'win32' && process.arch === 'arm64')) {
    console.log('[postinstall] not Windows-ARM64 — nothing to patch');
    return;
  }
  const root = path.join(__dirname, '..', 'node_modules');
  const rollupPkg = path.join(root, 'rollup', 'package.json');
  const nativePath = path.join(root, 'rollup', 'dist', 'native.js');
  const wasmPath = path.join(root, '@rollup', 'wasm-node');
  if (!fs.existsSync(rollupPkg) || !fs.existsSync(nativePath) || !fs.existsSync(wasmPath)) {
    console.log('[postinstall] rollup/wasm-node layout not found — skipping');
    return;
  }
  const name = JSON.parse(fs.readFileSync(rollupPkg, 'utf8')).name;
  if (name !== 'rollup') {
    console.log('[postinstall] rollup is already the WASM alias — OK');
    return;
  }
  const current = fs.readFileSync(nativePath, 'utf8');
  if (current.includes('VISUALISER PATCH')) {
    console.log('[postinstall] already patched — OK');
    return;
  }
  fs.writeFileSync(nativePath + '.bak', current, 'utf8');
  fs.writeFileSync(nativePath, `// VISUALISER PATCH: use the WASM build (native .node is blocked by policy).
const w = require('../../@rollup/wasm-node');
module.exports = { parse: w.parse, parseAsync: w.parseAsync, xxhashBase64Url: w.xxhashBase64Url, xxhashBase36: w.xxhashBase36, xxhashBase16: w.xxhashBase16 };
`, 'utf8');
  console.log('[postinstall] patched rollup/dist/native.js to use @rollup/wasm-node');
}

try { main(); } catch (e) { console.log('[postinstall] skipped:', e.message); }
