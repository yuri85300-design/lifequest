'use strict';
/**
 * Audit metadata against current public official Cyberpunk TCG card pages.
 * Collects official text fingerprints; never labels French text semantically certified.
 * Run: node native/official_card_audit.cjs
 * Requires: npm install --no-save playwright
 */
const {chromium}=require('playwright');
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const engine=require('./engine.js');
const cards=Object.values(engine.CARDS);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sha=text=>crypto.createHash('sha256').update(text.normalize('NFC')).digest('hex');
const root=path.join(__dirname,'..','audit-results');
fs.mkdirSync(root,{recursive:true});
const base='https://cyberpunktcg.com';
const result={generatedAt:new Date().toISOString(),source:base+'/cards',officialRules:base+'/comprehensive-rules',
  officialErrata:base+'/errata',runtimeCards:cards.length,officialCatalogueCount:null,
  inspected:0,accessible:0,metadataExact:0,metadataMismatches:[],fetchErrors:[],
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
async function main(){
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
 const page=await browser.newPage({userAgent:'Mozilla/5.0 (compatible; 7GigsCompatibilityAudit/1.0)'});
 try {
  await page.goto(base+'/cards',{waitUntil:'domcontentloaded',timeout:35000});
  const listing=await page.locator('body').innerText();
  result.officialCatalogueCount=Number(listing.match(/of\s+(\d+)\s+cards\s*\(Page/i)?.[1]||0)||null;
  // Card pagination varies; capture visible IDs then advance using accessible Next.
  const officialPaths=new Set();
  for(let p=0;p<10;p++){
    const paths=await page.locator('a[href*="/cards/"]').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).pathname));
    paths.forEach(x=>officialPaths.add(x));
    const next=page.getByRole('button',{name:'Next',exact:true});
    if(!(await next.count())||!(await next.isEnabled()))break;
    const current=await page.locator('body').innerText();
    await next.click();
    await page.waitForFunction(t=>document.body.innerText!==t,current,{timeout:12000}).catch(()=>{});
    const newer=await page.locator('body').innerText();
    if(newer===current)break;
  }
  result.officialOnly=[...officialPaths].map(x=>x.split('/').pop()).filter(x=>x&&!engine.CARDS[x]);
  result.missingFromOfficial=cards.map(c=>c.id).filter(id=>!officialPaths.has('/cards/'+id));
  const officialPage=await browser.newPage({userAgent:'Mozilla/5.0 (compatible; 7GigsCompatibilityAudit/1.0)'});
  for(const c of cards){
   const u=base+'/cards/'+encodeURIComponent(c.id);
   const datum={id:c.id,officialUrl:u,officialTextSha256:null,officialTextLength:0,status:'pending',diffs:[]};
   result.cardEvidence.push(datum);
   try {
     const response=await officialPage.goto(u,{waitUntil:'domcontentloaded',timeout:30000});
     if(!response||response.status()!==200)throw Error('HTTP '+(response?.status()||'no response'));
     let text=await officialPage.locator('body').innerText({timeout:12000});
     if(!text.includes('OFFICIAL CURRENT RULES TEXT')){
       await officialPage.getByText(/OFFICIAL CURRENT RULES TEXT/).waitFor({timeout:10000});
       text=await officialPage.locator('body').innerText();
     }
     const official=parse(text);if(!official||!official.text)throw Error('No official English text');
     result.accessible++;
     datum.officialTextSha256=sha(textNorm(official.text));
     datum.officialTextLength=official.text.length;
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
 md+='Official-only slugs: '+(result.officialOnly.join(', ')||'none detected')+'\n\n';
 md+='Runtime slugs not on current listing: '+(result.missingFromOfficial.join(', ')||'none detected')+'\n\n';
 md+='## Discrepancies\n\n';
 for(const v of result.metadataMismatches)md+='- '+v.id+': '+JSON.stringify(v.diffs)+'\n';
 for(const v of result.fetchErrors)md+='- UNAVAILABLE '+v.id+': '+v.error+'\n';
 fs.writeFileSync(path.join(root,'official-summary.md'),md);
 console.log(md.slice(0,4000));
 if(result.accessible!==cards.length||result.metadataMismatches.length||result.officialCatalogueCount!==cards.length||result.officialOnly.length||result.missingFromOfficial.length) process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
