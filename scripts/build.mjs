import { copyFile, cp, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = path.join(root, 'dist');
const vendor = path.join(output, 'vendor');
const dependency = name => {
  const local=path.join(root,'node_modules',name);
  if(existsSync(path.join(local,'package.json')))return local;
  return process.env.FOLIO_DEPENDENCY_ROOT ? path.join(process.env.FOLIO_DEPENDENCY_ROOT,name) : path.dirname(require.resolve(name+'/package.json'));
};

await mkdir(vendor, { recursive: true });
for (const name of ['index.html', 'app.js', 'style.css', 'pdf-engine.js', 'pdf-text-ui.js']) {
  await copyFile(path.join(root, 'src', name), path.join(output, name));
}
await mkdir(path.join(vendor,'mupdf'),{recursive:true});
for(const name of ['mupdf.js','mupdf-wasm.js','mupdf-wasm.wasm'])await copyFile(path.join(dependency('mupdf'),'dist',name),path.join(vendor,'mupdf',name));
await copyFile(path.join(dependency('mupdf'),'LICENSE'),path.join(vendor,'mupdf-LICENSE.txt'));
const ocr=path.join(vendor,'ocr');
await mkdir(path.join(ocr,'core'),{recursive:true});await mkdir(path.join(ocr,'lang'),{recursive:true});
for(const name of ['tesseract.esm.min.js','worker.min.js','tesseract.min.js.LICENSE.txt','worker.min.js.LICENSE.txt'])await copyFile(path.join(dependency('tesseract.js'),'dist',name),path.join(ocr,name));
for(const name of await readdir(dependency('tesseract.js-core')))if(name.includes('lstm')&&(name.endsWith('.wasm')||name.endsWith('.wasm.js')))await copyFile(path.join(dependency('tesseract.js-core'),name),path.join(ocr,'core',name));
await copyFile(path.join(dependency('tesseract.js-core'),'LICENSE'),path.join(ocr,'core','LICENSE'));
await copyFile(path.join(dependency('@tesseract.js-data/eng'),'4.0.0','eng.traineddata.gz'),path.join(ocr,'lang','eng.traineddata.gz'));
for(const name of ['LICENSE','NOTICE.md'])await copyFile(path.join(root,name),path.join(output,name));
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
