"""Package the complete browser app into a single offline HTML document."""
from pathlib import Path
import base64
import json
import sys

root = Path(__file__).resolve().parent
dist = root / 'dist'
target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'Folio.html'

def b64(path):
    return base64.b64encode(path.read_bytes()).decode('ascii')

def script_safe(text):
    return text.replace('</script', '<\\/script').replace('</SCRIPT', '<\\/SCRIPT')

assets = {}
for folder in ['cmaps', 'standard_fonts', 'wasm']:
    for path in (dist / 'vendor' / folder).rglob('*'):
        if path.is_file():
            assets[str(path.relative_to(dist / 'vendor'))] = b64(path)

bootstrap = '''
const FOLIO_ASSETS = ASSETS_JSON;
const folioBytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const folioModuleURL = URL.createObjectURL(new Blob([folioBytes(PDF_MODULE_JSON)], {type:'text/javascript'}));
const pdfjs = await import(folioModuleURL);
pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([folioBytes(PDF_WORKER_JSON)], {type:'text/javascript'}));
class FolioBinaryDataFactory {
  async fetch({kind, filename}) {
    const folder = {cMapUrl:'cmaps', standardFontDataUrl:'standard_fonts', wasmUrl:'wasm'}[kind];
    const value = FOLIO_ASSETS[folder+'/'+filename];
    if (!value) throw new Error('Missing embedded PDF resource: '+filename);
    return folioBytes(value);
  }
}
'''.replace('ASSETS_JSON', json.dumps(assets, separators=(',', ':'))).replace('PDF_MODULE_JSON', json.dumps(b64(dist / 'vendor' / 'pdf.mjs'))).replace('PDF_WORKER_JSON', json.dumps(b64(dist / 'vendor' / 'pdf.worker.mjs')))

app = (dist / 'app.js').read_text()
app = app.replace("import * as pdfjs from './vendor/pdf.mjs';\npdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.mjs';", bootstrap)
app = app.replace('pdfjs.getDocument({data:', 'pdfjs.getDocument({BinaryDataFactory:FolioBinaryDataFactory,useWorkerFetch:false,data:')
html = (dist / 'index.html').read_text()
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + (dist / 'style.css').read_text() + '</style>')
html = html.replace('<script src="vendor/pdf-lib.min.js" defer></script>', '<script>' + script_safe((dist / 'vendor' / 'pdf-lib.min.js').read_text()) + '</script>')
html = html.replace('<script src="vendor/jszip.min.js" defer></script>', '<script>' + script_safe((dist / 'vendor' / 'jszip.min.js').read_text()) + '</script>')
html = html.replace('<script type="module" src="app.js"></script>', '<script type="module">' + script_safe(app) + '</script>')
licenses = '\n\n'.join(p.read_text() for p in sorted((dist / 'vendor').glob('*LICENSE*')))
head, tail = html.rsplit('</body>', 1)
html = head + '<script type="text/plain" id="folio-third-party-licenses">' + script_safe(licenses) + '</script></body>' + tail
target.write_text(html)
print(f'Created {target.name} ({target.stat().st_size:,} bytes)')
