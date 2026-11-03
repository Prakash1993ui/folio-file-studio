"""Package the built app and its local runtime assets for offline serving."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys

root = Path(__file__).resolve().parent
dist = root / 'dist'
target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'Folio-Offline.zip'
if not (dist / 'pdf-engine.js').is_file():
    raise SystemExit('Run npm run build before packaging the app.')
if target.suffix.lower() != '.zip':
    raise SystemExit('The offline edition is a ZIP folder. Use a .zip output name.')
readme = """Folio offline edition

Extract this ZIP into a folder. Serve that folder with any local HTTP server.
For example, with Python 3, open a terminal in the extracted folder and run:

    python3 -m http.server 8080 --bind 127.0.0.1

Then open http://127.0.0.1:8080 in a modern browser.
Keep the terminal open while using the app. Press Ctrl+C to stop the server.
All PDF engines, OCR models, fonts and libraries are included locally.
The app needs HTTP serving for its JavaScript modules and WebAssembly engines.
Browser storage is local to the address and port used. Download important files.
Source: https://github.com/Prakash1993ui/folio-file-studio
License: GNU AGPL version 3 or later; see LICENSE and NOTICE.md.
"""
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(dist.rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(dist))
    archive.writestr('START-HERE.txt', readme)
print(f'Created {target.name} ({target.stat().st_size:,} bytes)')
