# Folio — File Studio

[Open Folio](https://prakash1993ui.github.io/folio-file-studio/)

A browser app for creating, editing, converting and collecting PDF, JPEG/PNG, ZIP, TXT and HTML files. File contents stay in the browser; the app has no upload backend. Runtime dependencies and the English OCR model are served with the app.

## Edit existing PDF text

1. Import a PDF and open it. **Edit existing text** is selected automatically.
2. Click a text area on the page. Change its original text in the sidebar.
3. Choose a font, size or color if needed, then click **Apply replacement**.
4. Download the edited PDF. **Undo last change** restores the previous version.

Replacement removes the selected source text and writes searchable PDF text into the page. Leaving the replacement empty deletes that selection. This changes the PDF content, rather than adding a comment or annotation. Other tools can still add text or visual covers.

For an image-based page, use **Recognize scan (English)** first. Review the detected text, click a recognized line and replace it. The selected image pixels are removed and new searchable text is inserted. OCR can make mistakes, especially on handwriting, low-resolution scans or complex layouts.

## Run the app

Use Node.js 22.13 or newer:

```sh
npm install
npm run build
npm test
npm start
```

Open **http://127.0.0.1:8080**. Set the `PORT` environment variable to change the port. The generated `dist/` folder can also be served by any static web host. GitHub Actions builds, tests and deploys the app to GitHub Pages when `main` changes.

## Tools

- **PDF:** replace existing text, recognize English scans, delete selected text, add text or visual covers, rotate/reorder pages, merge PDFs, add/delete pages, undo and export a page as JPEG.
- **Images:** create a canvas, crop, resize, rotate, flip, adjust brightness/contrast/grayscale, add text and export JPEG, PNG or PDF.
- **ZIP:** create archives, add files, rename/remove entries, undo, download entries and extract editable files into the workspace.
- **TXT & HTML:** UTF-8 editing, automatic saving, counts, HTML live preview and PDF/text/HTML exports.
- **Workspace:** drag and drop, search, filters, sorting, selection and ZIP packaging.

## Data and limits

IndexedDB saves the workspace locally per browser and origin. Clearing site data removes the workspace. Download important work to keep a separate copy. User files and browser data are never included in this repository.

Imports support files up to 50 MB each. Archive extraction supports up to 1,500 files and 200 MB unpacked. Encrypted ZIPs are not supported. Password-protected PDFs prompt for their password; it is held only in memory while the editor is open. Content-text replacement preserves PDF encryption. Page arrangement tools use a separate library and may not support encrypted files.

PDFs do not store text like word-processing documents. Folio edits detected text areas and does not automatically reflow surrounding paragraphs. It reuses the original font when the needed glyphs are available, otherwise uses a bundled replacement font. Unavailable glyphs produce an error without changing the document. Vertical writing, complex script shaping, outlined lettering and unusual layouts may not edit faithfully. Scan recognition currently supports English only. Scan replacement clears the selected image region and may affect a non-white background. Keep the original and check the downloaded result.

A visual cover only hides content and is not secure redaction. Latin text PDF creation uses selectable text; other scripts use rendered text images. HTML-to-PDF exports text rather than the complete styled page. HTML preview is sandboxed and blocks scripts, forms and external requests. Downloaded HTML preserves the original source.

## Offline edition

After building, use Python 3 to package the complete app:

```sh
npm run standalone
```

This creates **Folio-Offline.zip**, containing the app, PDF engines, OCR model, fonts and licenses. Extract it and follow `START-HERE.txt` to serve the folder locally. WebAssembly and module loading require a local HTTP server; the current edition is a folder package rather than a single HTML file. It needs no external runtime CDN.

## Source and license

`src/` contains the app. `scripts/build.mjs` prepares `dist/` using pinned npm dependency versions. `tests/pdf-content.test.mjs` verifies source-text removal, searchable replacement, cropped and rotated pages, undo input preservation and scan pixel replacement. Generated assets and `node_modules/` are ignored by Git.

Folio is distributed under GNU AGPL version 3 or later because its PDF content engine uses MuPDF. See `LICENSE` and `NOTICE.md`. PDF-LIB, Mozilla PDF.js, JSZip and Tesseract retain their respective component licenses. Runtime notices are copied into `dist/vendor/` by the build.
