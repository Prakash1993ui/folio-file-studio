import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mupdf from '../dist/vendor/mupdf/mupdf.js';
import { inspectPage, replaceText, rasterizeForOCR } from '../dist/pdf-engine.js';
const require=createRequire(import.meta.url);
const {PDFDocument,StandardFonts,degrees}=require(process.env.FOLIO_DEPENDENCY_ROOT?process.env.FOLIO_DEPENDENCY_ROOT+'/pdf-lib':'pdf-lib');

async function fixture(rotation=0,crop=false){
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
  const page=doc.addPage([600,800]);
  page.drawText('Original total: 123.45',{x:70,y:650,font,size:18});
  page.drawText('Keep this line unchanged',{x:70,y:600,font,size:14});
  page.setRotation(degrees(rotation));if(crop)page.setCropBox(30,40,500,700);
  const second=doc.addPage([600,800]);second.drawText('Second page survives',{x:70,y:650,font,size:18});
  return new Uint8Array(await doc.save());
}
function text(bytes,pageIndex=0,password=''){
  const d=mupdf.Document.openDocument(bytes,'application/pdf');if(d.needsPassword())d.authenticatePassword(password);
  const p=d.loadPage(pageIndex),s=p.toStructuredText();const out=s.asText();s.destroy();p.destroy();d.destroy();return out;
}
function annotationCount(bytes){const d=mupdf.Document.openDocument(bytes,'application/pdf'),p=d.loadPage(0);const n=p.getAnnotations().length;p.destroy();d.destroy();return n}

test('replaces original searchable text without creating an annotation',async()=>{
  const original=await fixture(),selection=inspectPage(original,0).runs.find(r=>r.text.includes('Original total'));
  const result=replaceText(original,0,selection,'Updated total: 987.65');
  const actual=text(result.bytes);
  assert.match(actual,/Updated total: 987\.65/);assert.doesNotMatch(actual,/Original total|123\.45/);
  assert.match(actual,/Keep this line unchanged/);assert.equal(annotationCount(result.bytes),0);
  assert.equal(result.fallback,false);assert.equal(result.fontName,'Helvetica');
  assert.match(text(original),/Original total/);assert.match(text(result.bytes,1),/Second page survives/);
});

for(const rotation of [90,180,270])test(`replacement stays at the selected location on a ${rotation} degree cropped page`,async()=>{
  const original=await fixture(rotation,true),selection=inspectPage(original,0).runs.find(r=>r.text.includes('Original total'));
  const result=replaceText(original,0,selection,'Replaced text');
  const after=inspectPage(result.bytes,0).runs.find(r=>r.text.includes('Replaced text'));
  assert.ok(after);assert.ok(Math.abs(after.origin[0]-selection.origin[0])<.05);assert.ok(Math.abs(after.origin[1]-selection.origin[1])<.05);
  assert.doesNotMatch(text(result.bytes),/Original total/);assert.match(text(result.bytes),/Keep this line/);
});

test('empty replacement deletes only the selected text',async()=>{
  const original=await fixture(),selection=inspectPage(original,0).runs[0];const result=replaceText(original,0,selection,'');
  assert.doesNotMatch(text(result.bytes),/Original total/);assert.match(text(result.bytes),/Keep this line/);assert.equal(annotationCount(result.bytes),0);
});

test('longer text fits the original width and remains editable',async()=>{
  const original=await fixture(),selection=inspectPage(original,0).runs[0];
  const result=replaceText(original,0,selection,'This is a substantially longer replacement for the selected line');
  assert.ok(result.fontSize<selection.fontSize);
  const next=inspectPage(result.bytes,0).runs.find(r=>r.text.includes('substantially'));
  const twice=replaceText(result.bytes,0,next,'Edited again');assert.match(text(twice.bytes),/Edited again/);assert.doesNotMatch(text(twice.bytes),/substantially/);
});

test('unsupported glyphs fail before altering the document',async()=>{
  const original=await fixture(),selection=inspectPage(original,0).runs[0];
  assert.throws(()=>replaceText(original,0,selection,'Missing emoji 🧑‍🚀'),/characters are not available/);
  assert.match(text(original),/Original total/);
});

test('password-protected PDFs require the password and keep encryption after text editing',async()=>{
  const original=await fixture(),source=mupdf.Document.openDocument(original,'application/pdf').asPDF();
  const buffer=source.saveToBuffer('encrypt=aes-256,user-password=test-open,owner-password=test-owner');
  const encrypted=buffer.asUint8Array().slice();buffer.destroy();source.destroy();
  assert.throws(()=>inspectPage(encrypted,0),/password/);
  assert.throws(()=>inspectPage(encrypted,0,'wrong'),/password/);
  const selection=inspectPage(encrypted,0,'test-open').runs[0];
  const result=replaceText(encrypted,0,selection,'Password protected edit',{password:'test-open'});
  const check=mupdf.Document.openDocument(result.bytes,'application/pdf');
  assert.ok(check.needsPassword());check.destroy();
  assert.match(text(result.bytes,0,'test-open'),/Password protected edit/);
  assert.doesNotMatch(text(result.bytes,0,'test-open'),/Original total/);
});

test('OCR replacement removes pixels from a scanned page',async()=>{
  const original=await fixture(),scan=rasterizeForOCR(original,0),selection=inspectPage(original,0).runs[0];
  const doc=await PDFDocument.create(),page=doc.addPage([600,800]),image=await doc.embedPng(scan.png);page.drawImage(image,{x:0,y:0,width:600,height:800});
  const bytes=new Uint8Array(await doc.save());assert.equal(inspectPage(bytes,0).runs.length,0);
  const result=replaceText(bytes,0,{...selection,ocr:true,quads:[]},'Scanned text replaced');
  assert.match(text(result.bytes),/Scanned text replaced/);assert.equal(annotationCount(result.bytes),0);
  const blank=replaceText(bytes,0,{...selection,ocr:true,quads:[]},'');
  const d=mupdf.Document.openDocument(blank.bytes,'application/pdf'),p=d.loadPage(0),pix=p.toPixmap(mupdf.Matrix.identity,mupdf.ColorSpace.DeviceRGB,false),pixels=pix.getPixels();
  let dark=0;for(let y=Math.ceil(selection.bbox[1]);y<Math.floor(selection.bbox[3]);y++)for(let x=Math.ceil(selection.bbox[0]);x<Math.floor(selection.bbox[2]);x++){const i=y*pix.getStride()+x*3;if(pixels[i]<150&&pixels[i+1]<150&&pixels[i+2]<150)dark++}
  assert.ok(dark<5,`Original scan text still has ${dark} dark pixels`);pix.destroy();p.destroy();d.destroy();
});
