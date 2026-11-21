'use strict';
/* Review aid: print the publisher's current English rules text for every
 * runtime card, one line per card, so the text <-> engine concordance can be
 * reviewed clause by clause. Read-only; certifies nothing.
 * Output lines: OFFICIAL_TEXT<TAB>id<TAB>{"type","cost","power","ram","text"}
 */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {chromium}=require('playwright');
const ctx={console,performance,Date,Math,setTimeout,clearTimeout,structuredClone};ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'engine.js'),'utf8')+'\nglobalThis.__ids=Object.keys(CARDS);',ctx);
const base='https://cyberpunktcg.com';
const slugs={'judy-alvarez-braindance-maestro':'judy-a-lvarez-braindance-maestro','judy-alvarez-nothing-to-doubt':'judy-a-lvarez-nothing-to-doubt'};
const printings={'judy-alvarez-braindance-maestro':'4ea89508-1831-4e21-b4b0-b61771722686','judy-alvarez-nothing-to-doubt':'dcfe8370-9abf-4395-b50b-efea505609ba'};
function parse(text){
  const i=text.indexOf('OFFICIAL CURRENT RULES TEXT');if(i<0)return null;
  const rules=text.slice(i).split(/\nSET:/)[0].replace(/^OFFICIAL CURRENT RULES TEXT\s*·?\s*ENGLISH\s*/,'').trim();
  const before=text.slice(0,i);
  const type=[...before.matchAll(/^\s*(LEGEND|UNIT|GEAR|PROGRAM)\s*$/gm)].at(-1)?.[1]||null;
  const field=k=>{const h=[...before.matchAll(new RegExp('^\\s*'+k+'\\s+(\\d+)\\s*$','gm'))];return h.length?Number(h.at(-1)[1]):null};
  return {type,cost:field('COST'),power:field('PWR'),ram:field('RAM'),text:rules};
}
(async()=>{
  const browser=await chromium.launch();
  const page=await browser.newPage({userAgent:'Mozilla/5.0 (compatible; 7GigsCompatibilityAudit/1.0)'});
  let ok=0;
  for(const id of ctx.__ids){
    const u=base+'/cards/'+encodeURIComponent(slugs[id]||id);
    let out=null;
    for(const target of [u,printings[id]?u+'?printing='+printings[id]:null].filter(Boolean)){
      try{const r=await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});
        const t=await page.locator('body').innerText({timeout:12000});
        if(r&&r.status()===200&&t.includes('OFFICIAL CURRENT RULES TEXT')){out=parse(t);break;}}catch(_){}
    }
    if(out)ok++;
    console.log('OFFICIAL_TEXT\t'+id+'\t'+JSON.stringify(out||{error:'unavailable'}));
    await new Promise(r=>setTimeout(r,120));
  }
  await browser.close();
  console.log('OFFICIAL_TEXT_SUMMARY\t'+ok+'/'+ctx.__ids.length);
  if(ok!==ctx.__ids.length)process.exitCode=1;
})();
