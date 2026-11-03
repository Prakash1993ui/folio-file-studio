const $=selector=>document.querySelector(selector);
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let enginePromise;
const engine=()=>enginePromise??=import('./pdf-engine.js').catch(e=>{enginePromise=null;throw e});

export function createPDFTextController(host) {
  let runs=[],bounds=[0,0,1,1],selected=null,enabled=true,bytesRef,ocrRuns=[],ocrPage=-1,worker=null,disposed=false;
  const section=document.createElement('div');section.className='tool-section pdf-edit-section';
  section.innerHTML=`<h3>EDIT ORIGINAL TEXT</h3><button class="tool-button active" id="pdfEditExisting">✎ Edit existing text</button><p id="pdfTextStatus" role="status">Finding editable text…</p><button class="tool-button" id="pdfOCR">Recognize scan (English)</button><div id="pdfReplacementForm" hidden><label class="field" style="margin-top:14px">Selected text<textarea id="pdfReplacementText" rows="4" spellcheck="true" aria-label="Replace selected PDF text"></textarea></label><span class="pdf-font-note" id="pdfOriginalFont"></span><label class="field">Replacement font<select id="pdfReplacementFont"><option value="original">Match original where possible</option><option value="Helvetica">Sans serif</option><option value="Times">Serif</option><option value="Courier">Monospace</option></select></label><div class="field-row"><label class="field">Size (pt)<input id="pdfReplacementSize" type="number" min="2" max="300" step="0.5"></label><label class="field">Text color<input id="pdfReplacementColor" type="color" value="#000000"></label></div><label class="pdf-fit-option"><input id="pdfFitText" type="checkbox" checked> Fit inside original width</label><button class="button primary" id="pdfApplyReplacement" style="width:100%">Apply replacement</button><button class="tool-button" id="pdfCancelReplacement" style="margin-top:8px;justify-content:center">Cancel selection</button><p>Applying replaces the original PDF content. Empty text deletes the selection. Undo restores the previous version.</p></div>`;
  $('.editor-sidebar').prepend(section);
  const layer=document.createElement('div');layer.id='pdfTextLayer';layer.className='pdf-text-layer';$('#pdfWrap').append(layer);
  const text=$('#pdfReplacementText');
  const guard=fn=>async()=>{try{await fn()}catch(e){host.toast(e.message,true)}};
  const hasDraft=()=>Boolean(selected)&&(text.value!==selected.text||$('#pdfReplacementFont').value!=='original'||Number($('#pdfReplacementSize').value)!==Number(selected.fontSize.toFixed(1))||$('#pdfReplacementColor').value!==asHex(selected.color||[0,0,0]));
  function asHex(c){if(c.length===1)c=[c[0],c[0],c[0]];if(c.length===4)c=[1-Math.min(1,c[0]+c[3]),1-Math.min(1,c[1]+c[3]),1-Math.min(1,c[2]+c[3])];return '#'+c.slice(0,3).map(n=>Math.round(Math.max(0,Math.min(1,n))*255).toString(16).padStart(2,'0')).join('')}
  function clear(){selected=null;$('#pdfReplacementForm').hidden=true;layer.querySelectorAll('.selected').forEach(b=>b.classList.remove('selected'))}
  function select(run) {
    if(hasDraft()){host.toast('Apply or cancel your current text edit first.');return;}
    selected=run;layer.querySelectorAll('.selected').forEach(b=>b.classList.remove('selected'));
    layer.querySelector(`[data-run="${run.id}"]`)?.classList.add('selected');
    $('#pdfReplacementForm').hidden=false;text.value=run.text;
    $('#pdfReplacementSize').value=run.fontSize.toFixed(1);$('#pdfReplacementFont').value='original';$('#pdfReplacementColor').value=asHex(run.color||[0,0,0]);
    $('#pdfOriginalFont').textContent=run.ocr?'Recognized scan · review the text before applying':`Original: ${run.fontName} · ${run.fontSize.toFixed(1)} pt`;
    text.focus();text.select();
  }
  function draw(){
    const [x0,y0,x1,y1]=bounds,w=x1-x0,h=y1-y0;
    layer.innerHTML=runs.map(r=>`<button type="button" class="pdf-edit-target ${r.ocr?'ocr-target':''}" data-run="${r.id}" aria-label="Edit text: ${escapeHTML(r.text)}" title="Click to edit: ${escapeHTML(r.text)}" style="left:${(r.bbox[0]-x0)/w*100}%;top:${(r.bbox[1]-y0)/h*100}%;width:${Math.max(.5,(r.bbox[2]-r.bbox[0])/w*100)}%;height:${Math.max(.7,(r.bbox[3]-r.bbox[1])/h*100)}%"></button>`).join('');
    layer.querySelectorAll('button').forEach(b=>b.onclick=()=>select(runs.find(r=>String(r.id)===b.dataset.run)));
    layer.hidden=!enabled;
    $('#pdfTextStatus').textContent=runs.length?`${runs.length} editable text ${runs.length===1?'area':'areas'}. Click text on the page to change it.`:'No selectable text found. Use Recognize scan for an image-based page.';
  }
  async function refresh(){
    clear();const source=host.getBytes(),page=host.getPage();
    if(source!==bytesRef||page!==ocrPage)ocrRuns=[];
    bytesRef=source;ocrPage=page;
    try{const api=await engine();if(disposed)return;const result=api.inspectPage(source,page,host.getPassword());bounds=result.bounds;runs=[...result.runs,...ocrRuns];draw()}
    catch(e){$('#pdfTextStatus').textContent='Text editing could not load: '+e.message;layer.innerHTML='';throw e}
  }
  async function applyDraft(force=false){
    if(!selected||(!force&&!hasDraft()))return;
    host.beginBusy('Replacing original PDF text…');
    const old=selected,remainingScanLines=ocrRuns.filter(run=>run.id!==selected.id);
    try {
      const api=await engine();const result=api.replaceText(host.getBytes(),host.getPage(),selected,text.value,{
        password:host.getPassword(),fontFamily:$('#pdfReplacementFont').value,fontSize:Number($('#pdfReplacementSize').value),color:$('#pdfReplacementColor').value,fit:$('#pdfFitText').checked,
      });
      selected=null;await host.commit(result.bytes);
      if(remainingScanLines.length){ocrRuns=remainingScanLines;runs=[...runs,...ocrRuns];draw()}
      section.scrollIntoView({block:'start'});
      host.toast(result.fallback?`Original text replaced · ${result.fontName} used for the new text`:'Original text replaced and saved');
    }catch(e){selected=old;throw e}finally{host.endBusy()}
  }
  async function recognize(){
    if(hasDraft())await applyDraft();
    host.beginBusy('Recognizing scanned text on this device…');
    try {
      const api=await engine();const raster=api.rasterizeForOCR(host.getBytes(),host.getPage(),host.getPassword());
      const ocr=(await import('./vendor/ocr/tesseract.esm.min.js')).default;
      if(!worker)worker=await ocr.createWorker('eng',1,{
        workerPath:new URL('./vendor/ocr/worker.min.js',import.meta.url).href,
        corePath:new URL('./vendor/ocr/core',import.meta.url).href,
        langPath:new URL('./vendor/ocr/lang',import.meta.url).href,
        workerBlobURL:false,
        logger:message=>{const label=$('#operationMask span');if(label&&message.status)label.textContent=message.status+(message.progress?' '+Math.round(message.progress*100)+'%':'')},
      });
      const result=await worker.recognize(new Blob([raster.png],{type:'image/png'}),{},{blocks:true,text:true});
      const native=api.inspectPage(host.getBytes(),host.getPage(),host.getPassword());bounds=native.bounds;
      const sx=(bounds[2]-bounds[0])/raster.width,sy=(bounds[3]-bounds[1])/raster.height;
      ocrRuns=[];
      const overlaps=(a,b)=>Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]))/Math.max(1,(a[2]-a[0])*(a[3]-a[1]));
      for(const block of result.data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){
        if(!line.text.trim()||line.confidence<30)continue;
        const b=line.bbox,box=[bounds[0]+b.x0*sx-.3,bounds[1]+b.y0*sy-.3,bounds[0]+b.x1*sx+.3,bounds[1]+b.y1*sy+.3];
        if(native.runs.some(r=>overlaps(box,r.bbox)>.45))continue;
        const base=line.baseline;
        ocrRuns.push({id:'ocr-'+ocrRuns.length,ocr:true,text:line.text.trim(),bbox:box,fontName:'OCR replacement',fontSize:Math.max(6,(box[3]-box[1])*.95),color:[0,0,0],origin:[box[0],base?bounds[1]+base.y0*sy:box[3]-.5],direction:[1,0],quads:[],confidence:line.confidence});
      }
      clear();runs=[...native.runs,...ocrRuns];bytesRef=host.getBytes();ocrPage=host.getPage();enabled=true;host.onMode('edit');draw();
      host.toast(ocrRuns.length?`${ocrRuns.length} scanned text lines found. Review the recognized text before replacing it.`:'No additional English text was recognized. Try a clearer or higher-resolution scan.');
    }finally{host.endBusy()}
  }
  $('#pdfEditExisting').onclick=()=>{enabled=true;host.onMode('edit');draw()};
  $('#pdfOCR').onclick=guard(recognize);$('#pdfApplyReplacement').onclick=guard(()=>applyDraft(true));$('#pdfCancelReplacement').onclick=clear;
  text.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();guard(()=>applyDraft(true))()}});
  return {refresh,hasDraft,applyDraft,setEnabled(on){enabled=on;layer.hidden=!on;$('#pdfEditExisting').classList.toggle('active',on)},async dispose(){disposed=true;await worker?.terminate();worker=null;section.remove();layer.remove()}};
}
