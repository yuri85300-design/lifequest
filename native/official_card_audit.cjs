'use strict';
/**
 * Audit metadata against current public official Cyberpunk TCG card pages.
 * Collects official text fingerprints; never labels French text semantically certified.
 * Run: node native/official_card_audit.cjs
 * Requires: npm install --no-save playwright
 */
const {chromium}=require('playwright');
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const vm=require('node:vm');
const sandbox={console,performance,Date,Math,setTimeout,clearTimeout,structuredClone};
sandbox.window=sandbox;sandbox.globalThis=sandbox;vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'engine.js'),'utf8'),sandbox);
const engine={CARDS:sandbox.CARDS};
const cards=Object.values(engine.CARDS);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sha=text=>crypto.createHash('sha256').update(text.normalize('NFC')).digest('hex');
const root=path.join(__dirname,'..','audit-results');
fs.mkdirSync(root,{recursive:true});
const base='https://cyberpunktcg.com';
const exactEnglishPrintings={
  'judy-alvarez-braindance-maestro':'4ea89508-1831-4e21-b4b0-b61771722686',
  'judy-alvarez-nothing-to-doubt':'dcfe8370-9abf-4395-b50b-efea505609ba'
};
const officialSlugs={
  'judy-alvarez-braindance-maestro':'judy-a-lvarez-braindance-maestro',
  'judy-alvarez-nothing-to-doubt':'judy-a-lvarez-nothing-to-doubt'
};
const officialSlug=id=>officialSlugs[id]||id;
const result={generatedAt:new Date().toISOString(),source:base+'/cards',officialRules:base+'/comprehensive-rules',
  officialErrata:base+'/errata',runtimeCards:cards.length,officialCatalogueCount:null,
  inspected:0,accessible:0,metadataExact:0,metadataMismatches:[],keywordMismatches:[],fetchErrors:[],
  missingFromOfficial:[],officialOnly:[],cardEvidence:[],semanticCertified:false};
const textNorm=x=>(x||'').replace(/\s+/g,' ').trim();
function parse(text) {
 const marker='OFFICIAL CURRENT RULES TEXT';
 const i=text.indexOf(marker);
 if(i<0)return null;
 const section=text.slice(i).split(/\nSET:/)[0];
 const rules=section.replace(/^OFFICIAL CURRENT RULES TEXT\s*·?\s*ENGLISH\s*/,'').trim();
 const before=text.slice(0,i);
 const type=[...before.matchAll(/^\s*(LEGEND|UNIT|GEAR|PROGRAM)\s*$/gm)].at(-1)?.[1]||null;
 const field=key=>{const hits=[...before.matchAll(new RegExp('^\\s*'+key+'\\s+(\\d+)\\s*$','gm'))];return hits.length?Number(hits.at(-1)[1]):null};
 return {type,cost:field('COST'),power:field('PWR'),ram:field('RAM'),text:rules};
}
function keywordAlignment(english,french){
 const checks=[
   ['play',/\\{Play\\}/i,/\\[JEU\\]/i],
   ['attack',/\\{Attack\\}/i,/\\[ATTAQUE\\]/i],
   ['call',/\\{Call\\}/i,/\\[APPEL\\]/i],
   ['defeated',/\\{Defeated\\}/i,/\\[VAINCU\\]/i],
   ['blocker',/\\{Blocker\\}/i,/\\[BLOQUEUR\\]/i],
   ['goSolo',/\\{Go Solo\\}/i,/\\[SOLO\\]/i],
   ['quick',/\\{Quick\\}/i,/\\[RAPIDE\\]/i],
   ['adrenaline',/\\{Adrenaline\\}/i,/\\[ADRÉNALINE\\]/i],
   ['spend',/\\{Spend\\}/i,/\\[⟳\\]/i],
 ];
 return checks.filter(([,a,b])=>a.test(english)!==b.test(french||''))
  .map(([keyword,a,b])=>({keyword,official:a.test(english),local:b.test(french||'')}));
}
async function main(){
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
 const page=await browser.newPage({userAgent:'Mozilla/5.0 (compatible; 7GigsCompatibilityAudit/1.0)'});
 try {
  await page.goto(base+'/cards',{waitUntil:'domcontentloaded',timeout:35000});
  const listing=await page.locator('body').innerText();
  result.officialCatalogueCount=Number(listing.match(/of\s+(\d+)\s+cards\s*\(Page/i)?.[1]||0)||null;
  // Discover all pages in the publisher's own client-side pagination.
  const officialPaths=new Set();
  const listingPages=[];
  for(let p=0;p<10;p++){
    const current=await page.locator('body').innerText();
    const pageNo=Number(current.match(/Page\s+(\d+)\s+of\s+\d+/i)?.[1]||p+1);
    const paths=await page.locator('a[href*="/cards/"]').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).pathname));
    paths.forEach(x=>officialPaths.add(x));
    listingPages.push({page:pageNo,found:paths.length});
    const next=page.getByText('Next',{exact:true}).last();
    if(!(await next.count()))break;
    const beforePage=pageNo;
    await next.click({timeout:8000}).catch(()=>{});
    await page.waitForFunction(previous=>{
      const m=document.body.innerText.match(/Page\s+(\d+)\s+of\s+\d+/i);
      return Boolean(m&&Number(m[1])>previous);
    },beforePage,{timeout:10000}).catch(()=>{});
    const after=await page.locator('body').innerText();
    const newPage=Number(after.match(/Page\s+(\d+)\s+of\s+\d+/i)?.[1]||0);
    if(newPage<=beforePage)break;
  }
  result.listingPages=listingPages;
  result.listingItemsFound=officialPaths.size;
  result.listingComplete=result.officialCatalogueCount!==null && officialPaths.size>=result.officialCatalogueCount;
  result.officialOnly=result.listingComplete?[...officialPaths].map(x=>x.split('/').pop()).filter(x=>x&&!engine.CARDS[x]&&!Object.values(officialSlugs).includes(x)):[];
  result.missingFromOfficial=result.listingComplete?cards.map(c=>c.id).filter(id=>!officialPaths.has('/cards/'+officialSlug(id))):[];
  const officialPage=await browser.newPage({userAgent:'Mozilla/5.0 (compatible; 7GigsCompatibilityAudit/1.0)'});
  for(const c of cards){
   const u=base+'/cards/'+encodeURIComponent(officialSlug(c.id));
   const datum={id:c.id,officialUrl:u,officialTextSha256:null,officialTextLength:0,status:'pending',diffs:[]};
   result.cardEvidence.push(datum);
   try {
     let text='',status=0;
     const urls=[u];
     if(exactEnglishPrintings[c.id])urls.push(u+'?printing='+exactEnglishPrintings[c.id]);
     for(const target of urls){
       const response=await officialPage.goto(target,{waitUntil:'domcontentloaded',timeout:30000});
       status=response?.status()||0;
       text=await officialPage.locator('body').innerText({timeout:12000});
       if(status===200&&text.includes('OFFICIAL CURRENT RULES TEXT'))break;
       await sleep(500);
     }
     if(status!==200)throw Error('HTTP '+status);
     const official=parse(text);
     if(!official||!official.text)throw Error('No English text at '+officialPage.url()+'; title '+await officialPage.title());
     result.accessible++;
     datum.officialTextSha256=sha(textNorm(official.text));
     datum.officialTextLength=official.text.length;
     datum.keywordAlignment=keywordAlignment(official.text,c.txt);
     if(datum.keywordAlignment.length)result.keywordMismatches.push({id:c.id,keywords:datum.keywordAlignment});
     for(const [field,expected] of [['type',c.type.toUpperCase()],['cost',c.cost??null],['power',c.power??null],['ram',c.ram??null]]){
       const actual=official[field];
       if(expected!==actual)datum.diffs.push({field,expected,official:actual});
     }
     datum.status=datum.diffs.length?'METADATA_MISMATCH':'METADATA_MATCH';
     if(datum.diffs.length)result.metadataMismatches.push({id:c.id,diffs:datum.diffs});
     else result.metadataExact++;
   }catch(e){
     datum.status='UNAVAILABLE';datum.error=String(e.message||e).slice(0,220);
     result.fetchErrors.push({id:c.id,error:datum.error});
   }
   result.inspected++;
   if(result.inspected%15===0)console.log('Official cards checked',result.inspected,'/',cards.length);
   await sleep(120);
  }
  await officialPage.close();
 } finally {await browser.close()}
 fs.writeFileSync(path.join(root,'official-cards.json'),JSON.stringify(result,null,2));
 let md='# Official card metadata audit\n\n';
 md+='Date: '+result.generatedAt+'\n\n';
 md+='Source: '+result.source+'\n\n';
 md+='Official catalogue: '+result.officialCatalogueCount+' ; runtime: '+result.runtimeCards+'\n\n';
 md+='Accessible: '+result.accessible+' / '+result.inspected+'; metadata matched: '+result.metadataExact+'; mismatched: '+result.metadataMismatches.length+'\n\n';
 md+='**Semantic certification: NOT ACHIEVED**. A metadata match cannot certify effects, triggers, targets, choices, timing or errata.\n\n';
 md+='Listing pages: '+JSON.stringify(result.listingPages)+'; unique listings: '+result.listingItemsFound+'; complete: '+result.listingComplete+'\n\n';
 md+='Official-only slugs: '+(result.officialOnly.join(', ')||'none detected')+'\n\n';
 md+='Runtime slugs not on current listing: '+(result.missingFromOfficial.join(', ')||'none detected')+'\n\n';
 md+='## Discrepancies\n\n';
 for(const v of result.metadataMismatches)md+='- '+v.id+': '+JSON.stringify(v.diffs)+'\n';
 for(const v of result.fetchErrors)md+='- UNAVAILABLE '+v.id+': '+v.error+'\n';
 fs.writeFileSync(path.join(root,'official-summary.md'),md);
 console.log(md.slice(0,4000));
 // Extra official promo-only cards are reported, not grounds to fail the
 // fixed 150-card base runtime's metadata audit. They remain out of scope.
 if(result.accessible!==cards.length||result.metadataMismatches.length||!result.listingComplete||result.missingFromOfficial.length) process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
