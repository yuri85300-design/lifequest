'use strict';
/* PRIME 2.7.8 — "Ma collection" list layout. Reported: the card name collapsed to 0 px (one letter per
 * line, ~800 px tall rows) because the +/- control inherited width:100% from the deck builder.
 * Checks every one of the 150 rows at phone, small phone and desktop widths on the PUBLISHED runtime.
 * Usage: node collection_layout_278.cjs <built-dir> [index.html]
 */
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const dir=process.argv[2],file=process.argv[3]||'index.html';
const server=http.createServer((q,r)=>{const f=path.join(dir,decodeURIComponent(q.url.split('?')[0]));
  if(!f.startsWith(dir)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
  r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});fs.createReadStream(f).pipe(r);});
const out={checks:{},viewports:{}};const ok=(k,v)=>{out.checks[k]=v?'PASS':'FAIL';};
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}/${file}`;
  const browser=await chromium.launch();const errors=[];
  for(const vp of [{n:'phone390',w:390,h:844,m:true},{n:'small320',w:320,h:640,m:true},{n:'desktop1280',w:1280,h:800,m:false}]){
    const page=await browser.newPage({viewport:{width:vp.w,height:vp.h},isMobile:vp.m,hasTouch:vp.m});
    page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.locator('[data-nav="decks"]').first().click();
    await page.locator('[data-nav="collection"]').first().click();
    await page.waitForSelector('.collection-grid');
    const m=await page.evaluate(()=>{
      const rows=[...document.querySelectorAll('.collection-entry')];let minName=1e9,maxQty=0,maxH=0,overflow=0,dup=0,tiny=0;
      for(const e of rows){
        const er=e.getBoundingClientRect(),n=e.querySelector('.collection-cardname').getBoundingClientRect(),q=e.querySelector('.sim-qty').getBoundingClientRect();
        minName=Math.min(minName,n.width);maxQty=Math.max(maxQty,q.width);maxH=Math.max(maxH,er.height);
        if(q.right>er.right+1||q.left<er.left-1||n.right>q.left+1)overflow++;
        for(const b of e.querySelectorAll('button')){const r=b.getBoundingClientRect();if(r.width<28||r.height<28)tiny++;}
        // the English name must add information: it may not repeat the French one (or its leading words)
        const parts=e.querySelector('.collection-cardname b').textContent.split(' · ');
        // whole-word prefix only: "Minotaure · Minotaur" is a genuine translation, not a repeat
        if(parts.length===2&&(parts[0]===parts[1]||parts[0].startsWith(parts[1]+' ')))dup++;
      }
      return {rows:rows.length,minName:Math.round(minName),maxQty:Math.round(maxQty),maxH:Math.round(maxH),overflow,dup,tiny};});
    out.viewports[vp.n]=m;
    ok(vp.n+':all150Rows',m.rows===150);
    ok(vp.n+':nameReadable',m.minName>=90);
    ok(vp.n+':qtyControlCompact',m.maxQty<=170);
    ok(vp.n+':rowsNotTall',m.maxH<=150);
    ok(vp.n+':controlsInsideRow',m.overflow===0);
    ok(vp.n+':buttonsTappable',m.tiny===0);
    ok(vp.n+':noRepeatedNames',m.dup===0);
    // the +/- controls still work
    const first=page.locator('[data-own-plus]').first();await first.click();await first.click();
    ok(vp.n+':plusWorks',(await page.locator('[data-own-count]').first().textContent()).trim()==='2');
    await page.locator('[data-own-minus]').first().click();
    ok(vp.n+':minusWorks',(await page.locator('[data-own-count]').first().textContent()).trim()==='1');
    if(vp.n==='phone390')await page.screenshot({path:path.join(dir,'collection.png')});
    await page.close();
  }
  out.pageErrors=errors;ok('noPageErrors',errors.length===0);
  await browser.close();server.close();
  out.status=Object.values(out.checks).every(v=>v==='PASS')?'PASS':'FAIL';
  console.log(JSON.stringify(out,null,1));
  if(out.status!=='PASS')process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(2);});
