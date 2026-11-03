import { copyFile, cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = path.join(root, 'dist');
const vendor = path.join(output, 'vendor');
const dependency = name => process.env.FOLIO_DEPENDENCY_ROOT
  ? path.join(process.env.FOLIO_DEPENDENCY_ROOT, name)
  : path.dirname(require.resolve(name + '/package.json'));

await mkdir(vendor, { recursive: true });
for (const name of ['index.html', 'app.js', 'style.css']) {
  await copyFile(path.join(root, 'src', name), path.join(output, name));
}
for (const [name, source, destination] of [
  ['pdf-lib', 'dist/pdf-lib.min.js', 'pdf-lib.min.js'],
  ['pdf-lib', 'LICENSE.md', 'pdf-lib-LICENSE.md'],
  ['jszip', 'dist/jszip.min.js', 'jszip.min.js'],
  ['jszip', 'LICENSE.markdown', 'jszip-LICENSE.md'],
  ['pdfjs-dist', 'build/pdf.mjs', 'pdf.mjs'],
  ['pdfjs-dist', 'build/pdf.worker.mjs', 'pdf.worker.mjs'],
  ['pdfjs-dist', 'LICENSE', 'pdfjs-LICENSE.txt'],
]) {
  await copyFile(path.join(dependency(name), source), path.join(vendor, destination));
}
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(path.join(dependency('pdfjs-dist'), folder), path.join(vendor, folder), { recursive: true });
}
console.log('Folio built in dist/. Run npm start to open the local workspace.');
