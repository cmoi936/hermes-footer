import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = import.meta.dirname;
const OUT = process.env.OUT_DIR || '/opt/data/hercules-site/html/assets';
const VERSION_FILE = resolve(ROOT, 'dist/version.txt');

mkdirSync(OUT, { recursive: true });
mkdirSync(resolve(ROOT, 'dist'), { recursive: true });

const result = await build({
  entryPoints: [resolve(ROOT, 'src/mount.jsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2019'],
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  write: false,
  outfile: 'hermes-footer.js',
});

const js = result.outputFiles[0].contents;
const css = readFileSync(resolve(ROOT, 'src/footer.css'));
const cfg = readFileSync(resolve(ROOT, 'hermes-footer.json'));

const hash = createHash('sha256').update(js).update(css).digest('hex').slice(0, 8);

writeFileSync(resolve(OUT, 'hermes-footer.js'), js);
writeFileSync(resolve(OUT, 'hermes-footer.css'), css);
writeFileSync(resolve(OUT, 'hermes-footer.json'), cfg);
writeFileSync(VERSION_FILE, hash);

// Copie dans dist/ pour la publication (dépôt + archive npm).
writeFileSync(resolve(ROOT, 'dist/hermes-footer.js'), js);
writeFileSync(resolve(ROOT, 'dist/hermes-footer.css'), css);
copyFileSync(resolve(ROOT, 'hermes-footer.json'), resolve(ROOT, 'dist/hermes-footer.json'));

console.log(`hermes-footer.js   ${(js.length / 1024).toFixed(1)} Ko`);
console.log(`hermes-footer.css  ${(css.length / 1024).toFixed(1)} Ko`);
console.log(`hermes-footer.json ${cfg.length} o`);
console.log(`version ${hash}`);
