# Folio — File Studio

A browser app for creating, editing, converting and collecting PDF, JPEG/PNG, ZIP, TXT and HTML files. File contents stay in the browser; the app has no upload backend.

## Run the app

Use Node.js 22.13 or newer:

```sh
npm install
npm run build
npm start
```

Open **http://127.0.0.1:8080**. Set the `PORT` environment variable to change the port. The generated `dist/` folder can also be served by any static web host.

## Tools

- **PDF:** create from text, annotate with text or visual covers, rotate/reorder pages, merge PDFs, add/delete pages, undo and export a page as JPEG.
- **Images:** create a canvas, crop, resize, rotate, flip, adjust brightness/contrast/grayscale, add text and export JPEG, PNG or PDF.
- **ZIP:** create archives, add files, rename/remove entries, undo, download entries and extract editable files into the workspace.
- **TXT & HTML:** UTF-8 editing, automatic saving, counts, HTML live preview and PDF/text/HTML exports.
- **Workspace:** drag and drop, search, filters, sorting, selection and ZIP packaging.

## Data and limits

IndexedDB saves the workspace locally per browser and origin. Clearing site data removes the workspace. Download important work to keep a separate copy. User files and browser data are never included in this repository.

Imports support files up to 50 MB each. Archive extraction supports up to 1,500 files and 200 MB unpacked. Password protected PDF editing and encrypted ZIPs are not supported.

PDF editing adds annotations and manages pages; it does not directly rewrite existing text. A visual cover does not securely redact the data beneath it. Latin text PDF creation uses selectable text; other scripts use rendered text images. HTML-to-PDF exports text rather than the complete styled page.

HTML preview is sandboxed and blocks scripts, forms and external requests. Downloaded HTML preserves the original source.

## Standalone edition

After building, use Python 3 to produce a self-contained HTML edition:

```sh
npm run standalone
```

This creates `Folio.html` with the app, libraries, PDF worker, fonts and CMaps embedded. Some browsers restrict local-file storage; download your work if the app reports session-only storage. Browser workflows have been tested through a local server; direct file-protocol launch remains unverified.

## Source layout

`src/` contains the app. `scripts/build.mjs` prepares `dist/` using the pinned npm dependencies. Generated assets and `node_modules/` are ignored by Git.

The app uses PDF-LIB, Mozilla PDF.js and JSZip. Their licenses are copied into `dist/vendor/` by the build. No CDN dependencies are required at runtime.
