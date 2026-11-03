import * as mupdf from './vendor/mupdf/mupdf.js';

function open(bytes, password = '') {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf').asPDF();
  if (!doc) throw new Error('This is not a PDF document.');
  if (doc.needsPassword() && !doc.authenticatePassword(password)) {
    doc.destroy();
    throw new Error('Enter the PDF password before editing this document.');
  }
  return doc;
}

function rectFromQuad(q) {
  return [Math.min(q[0],q[2],q[4],q[6]), Math.min(q[1],q[3],q[5],q[7]),
    Math.max(q[0],q[2],q[4],q[6]), Math.max(q[1],q[3],q[5],q[7])];
}

function collect(page) {
  const structured = page.toStructuredText('preserve-whitespace');
  const runs = [];
  let run, direction = [1,0], writingMode = 0;
  const finish = () => {
    if (run && run.text.trim()) { run.id = runs.length; runs.push(run); }
    else run?.font.destroy();
    run = null;
  };
  structured.walk({
    beginLine(_box, wmode, dir) { finish(); direction = [...dir]; writingMode = wmode; },
    onChar(ch, origin, font, size, quad, color) {
      const fontName = font.getName();
      const key = `${fontName}:${size.toFixed(3)}:${color.join(',')}`;
      if (run?.key !== key) {
        finish();
        run = { key, text:'', font, fontName, fontSize:size, color:[...color],
          origin:[...origin], direction:[...direction], writingMode, quads:[],
          bbox:[Infinity,Infinity,-Infinity,-Infinity],
          bold:font.isBold(), italic:font.isItalic(), serif:font.isSerif(), mono:font.isMono() };
      } else font.destroy();
      const box = rectFromQuad(quad);
      run.text += ch; run.quads.push([...quad]);
      run.bbox = [Math.min(run.bbox[0],box[0]),Math.min(run.bbox[1],box[1]),
        Math.max(run.bbox[2],box[2]),Math.max(run.bbox[3],box[3])];
    },
    endLine:finish,
  });
  finish(); structured.destroy();
  return runs;
}

export function inspectPage(bytes, pageIndex, password = '') {
  const doc = open(bytes,password); let page, runs = [];
  try {
    page = doc.loadPage(pageIndex); runs = collect(page);
    return { bounds:page.getBounds(), runs:runs.map(({font,key,...run})=>run) };
  } finally { runs.forEach(r=>r.font.destroy()); page?.destroy(); doc.destroy(); }
}

export function rasterizeForOCR(bytes, pageIndex, password = '') {
  const doc=open(bytes,password);let page,pixmap;
  try {
    page=doc.loadPage(pageIndex);const bounds=page.getBounds();
    const scale=Math.min(3,3000/Math.max(bounds[2]-bounds[0],bounds[3]-bounds[1]));
    pixmap=page.toPixmap(mupdf.Matrix.scale(scale,scale),mupdf.ColorSpace.DeviceRGB,false,true);
    return {png:pixmap.asPNG().slice(),width:pixmap.getWidth(),height:pixmap.getHeight(),bounds};
  } finally {pixmap?.destroy();page?.destroy();doc.destroy();}
}

function chooseFont(run, text, family) {
  const supports = font => [...text.replace(/\n/g,'')].every(ch=>font.encodeCharacter(ch)>0);
  if ((!family || family==='original') && run.font && supports(run.font)) return {font:run.font, fallback:false, owned:false};
  const base = family && family!=='original' ? family : run.mono?'Courier':run.serif?'Times':'Helvetica';
  let name = base==='Times'?'Times-Roman':base;
  if (run.bold && run.italic) name=base==='Times'?'Times-BoldItalic':base+'-BoldOblique';
  else if (run.bold) name=base+'-Bold';
  else if (run.italic) name=base==='Times'?'Times-Italic':base+'-Oblique';
  let font = new mupdf.Font(name);
  if (supports(font)) return {font,fallback:true,owned:true};
  font.destroy(); font = new mupdf.Font('zh-Hans');
  if (supports(font)) return {font,fallback:true,owned:true};
  font.destroy();
  throw new Error('These characters are not available in the original or bundled replacement fonts. Try text supported by the document’s font.');
}

function appendContent(doc, page, font, stream) {
  const object = page.getObject();
  // Copy inherited resources before changing them so sibling pages are untouched.
  const resources = doc.newDictionary(), fonts = doc.newDictionary();
  const previous = object.getInheritable('Resources');
  if (previous.isDictionary()) previous.forEach((v,k)=>resources.put(k,v));
  const oldFonts = resources.get('Font');
  if (oldFonts.isDictionary()) oldFonts.forEach((v,k)=>fonts.put(k,v));
  let name='FolioEdit',i=1; while(!fonts.get(name).isNull()) name='FolioEdit'+i++;
  fonts.put(name,doc.addFont(font)); resources.put('Font',fonts); object.put('Resources',resources);
  const contents = doc.newArray(), old = object.get('Contents');
  contents.push(doc.addStream('q\n',{}));
  if (old.isArray()) old.forEach(v=>contents.push(v)); else if(!old.isNull()) contents.push(old);
  contents.push(doc.addStream('Q\n'+stream.replaceAll('/FOLIO_FONT', '/'+name),{}));
  object.put('Contents',contents);
}

function rgb(color) {
  if(color.length===1) return [color[0],color[0],color[0]];
  if(color.length===4) return [1-Math.min(1,color[0]+color[3]),1-Math.min(1,color[1]+color[3]),1-Math.min(1,color[2]+color[3])];
  return color.slice(0,3);
}

export function replaceText(bytes, pageIndex, selection, value, options = {}) {
  const doc = open(bytes,options.password); let page, runs=[], chosen, saved;
  try {
    page = doc.loadPage(pageIndex);
    runs = collect(page);
    const run = selection.ocr ? {...selection,font:null} : runs.find(r=>r.id===selection.id);
    if(!run) throw new Error('The page changed. Select the text again.');
    if(run.writingMode) throw new Error('Vertical writing is not supported by this editor yet.');
    const text = String(value).replace(/\r/g,'').replace(/\t/g,'    ');
    if(text.length>5000) throw new Error('Keep a single text replacement below 5,000 characters.');
    chosen = chooseFont(run,text,options.fontFamily);
    let fontSize = Number(options.fontSize || run.fontSize);
    if(!Number.isFinite(fontSize)||fontSize<2||fontSize>300) throw new Error('Choose a font size from 2 to 300 points.');
    const lines=text.split('\n'), font=chosen.font;
    const measure=t=>[...t].reduce((sum,ch)=>sum+font.advanceGlyph(font.encodeCharacter(ch)),0);
    const width=Math.max(1,run.bbox[2]-run.bbox[0]), height=Math.max(1,run.bbox[3]-run.bbox[1]);
    const direction=run.direction||[1,0];
    const runLength=run.quads?.length?Math.hypot(run.quads.at(-1)[2]-run.quads[0][0],run.quads.at(-1)[3]-run.quads[0][1]):width;
    if(options.fit!==false) {
      const maxAdvance=Math.max(...lines.map(measure),.001);
      fontSize=Math.min(fontSize,Math.max(2,runLength/maxAdvance));
      if(lines.length>1)fontSize=Math.min(fontSize,Math.max(2,height/(lines.length*1.2)));
    }
    // Native text is removed without erasing background art. OCR selections also
    // remove the covered pixels from the source image rather than masking them.
    const quads=run.quads?.length?run.quads:[];
    if(quads.length) {
      const redaction=page.createAnnotation('Redact');
      const inset=quads.map(q=>{const cx=(q[0]+q[2]+q[4]+q[6])/4,cy=(q[1]+q[3]+q[5]+q[7])/4;return q.map((v,i)=>v*.8+(i%2?cy:cx)*.2)});
      redaction.setQuadPoints(inset); redaction.setRect(run.bbox); redaction.update();
    } else {
      const redaction=page.createAnnotation('Redact');redaction.setRect(run.bbox);redaction.update();
    }
    page.applyRedactions(false,selection.ocr?mupdf.PDFPage.REDACT_IMAGE_PIXELS:mupdf.PDFPage.REDACT_IMAGE_NONE,mupdf.PDFPage.REDACT_LINE_ART_NONE,mupdf.PDFPage.REDACT_TEXT_REMOVE);
    if(text.length) {
      const inverse=mupdf.Matrix.invert(page.getTransform());
      const color=options.color?options.color.match(/\w\w/g).map(v=>parseInt(v,16)/255):rgb(run.color||[0,0,0]);
      let stream='q\n'+color.map(n=>n.toFixed(5)).join(' ')+' rg\nBT\n/FOLIO_FONT '+fontSize.toFixed(5)+' Tf\n';
      lines.forEach((line,i)=>{
        const x=run.origin[0]-direction[1]*i*fontSize*1.2,y=run.origin[1]+direction[0]*i*fontSize*1.2;
        const matrix=mupdf.Matrix.concat([direction[0],direction[1],direction[1],-direction[0],x,y],inverse);
        const hex=[...line].map(ch=>font.encodeCharacter(ch).toString(16).padStart(4,'0')).join('');
        stream+=matrix.map(n=>n.toFixed(5)).join(' ')+' Tm\n<'+hex+'> Tj\n';
      });
      appendContent(doc,page,font,stream+'ET\nQ\n');
    }
    // A full rewrite with garbage collection excludes removed source objects.
    saved=doc.saveToBuffer('garbage=4,compress');
    return {bytes:saved.asUint8Array().slice(),fontName:font.getName(),fontSize,fallback:chosen.fallback};
  } finally {
    saved?.destroy();if(chosen?.owned)chosen.font.destroy();runs.forEach(r=>r.font.destroy());page?.destroy();doc.destroy();
  }
}
