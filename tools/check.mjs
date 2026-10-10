import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Manifest V3 required');
if (JSON.stringify(manifest.permissions) !== JSON.stringify(['storage', 'scripting'])) throw new Error('Unexpected permission');
const files = new Set([
  manifest.background.service_worker, manifest.action.default_popup,
  ...manifest.content_scripts.flatMap(script => script.js), ...Object.values(manifest.icons),
  'src/popup.css', 'src/popup.js', 'src/settings.js'
]);
for (const file of files) await access(new URL(file, root));
for (const file of ['src/background.js','src/content.js','src/popup.js','src/settings.js']) {
  execFileSync(process.execPath, ['--check', new URL(file, root).pathname]);
}
for (const [size, file] of Object.entries(manifest.icons)) {
  const buffer = await readFile(new URL(file, root));
  if (buffer.readUInt32BE(16) !== Number(size) || buffer.readUInt32BE(20) !== Number(size)) throw new Error(`Wrong icon dimensions: ${file}`);
}
const popup = await readFile(new URL(manifest.action.default_popup, root), 'utf8');
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(popup) || /\bon\w+=/i.test(popup)) throw new Error('Inline popup scripts violate CSP');
console.log('Manifest, runtime files, syntax, icon dimensions and popup CSP checks passed.');
