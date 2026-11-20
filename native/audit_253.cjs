'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const html=fs.readFileSync(process.env.PRIME_HTML||'native/prime_v253_runtime.html','utf8');
const a=html.indexOf('function miniHTML('),b=html.indexOf('function bigCardHTML(',a);
const c=html.indexOf('function choiceSheet('),d=html.indexOf('function actionLabel(',c);
assert(a>=0&&b>a&&c>=0&&d>c,'game UI functions must be present');
const {window,document}=parseHTML('<html><body><div id="app"></div></body></html>');
const app=document.querySelector('#app');
const S={game:null,sheet:null};
const CARDS={
  'corpo-security':{id:'corpo-security',name:'Sécurité Corpo',color:'Green',type:'Unit',power:2,cost:2,gear:[]},
  'maxtac-navi':{id:'maxtac-navi',name:'Navi de la MaxTac',color:'Green',type:'Unit',power:8,cost:5,gear:[]},
  'gorilla-arms':{id:'gorilla-arms',name:'Gorilla Arms',color:'Red',type:'Gear',power:2,cost:2,gear:[]}
};
const titles={'corpo-security':'Sécurité Corpo','maxtac-navi':'Navi de la MaxTac','gorilla-arms':'Gorilla Arms'};
const esc=t=>String(t??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function openSheet(str){
  const div=document.createElement('div');div.className='scrim';
  div.innerHTML='<div class="sheet">'+str+'</div>';app.appendChild(div);S.sheet=div;return div;
}
function closeSheet(){if(S.sheet){S.sheet.remove();S.sheet=null}}
const ctx={console,window,document,app,S,CARDS,esc,openSheet,closeSheet,
  cardName:d=>titles[d.id]||d.name,cardArt:id=>'images_vf/'+id+'.webp',
  ICON:{Unit:'<i></i>',Gear:'<i></i>'},HUMAN:0,dieSVG:()=>'<svg></svg>',toast:()=>{},setTimeout,clearTimeout,
  Math,Date};
ctx.globalThis=ctx;vm.createContext(ctx);
vm.runInContext(html.slice(a,b)+'\n'+html.slice(c,d)+'\nglobalThis.CHOICE_TEST={miniHTML,choiceSheet};',ctx);
const {miniHTML,choiceSheet}=ctx.CHOICE_TEST;
const inst=id=>({id,uid:id==='corpo-security'?201:202,gear:[],lag:false,ready:true});
const g={onField:()=>true,where:()=>({zone:'field'}),controllerOf:()=>1,
  eff:c=>CARDS[c.id].power,P:()=>({gigs:[]}),name:c=>titles[c.id]};
async function runChoice(selected,max,min,peek){
  const req={title:'Floor It : -1 à…',min,max,options:[
    {value:201,label:'Sécurité Corpo',card:inst('corpo-security')},
    {value:202,label:'Navi de la MaxTac',card:inst('maxtac-navi')}
  ]};
  const pending=choiceSheet(g,0,req),options=[...app.querySelectorAll('.sheet .opt[data-k]')];
  assert.equal(options.length,2,'two whole clickable card choices, no orphaned text');
  assert.equal(app.querySelectorAll('button button').length,0,'nested interactive buttons are forbidden');
  for(const [i,opt] of options.entries()){
    assert.equal(opt.tagName,'BUTTON','whole row must be a button');
    assert.equal(opt.querySelector('.mini')?.tagName,'SPAN','thumbnail must be non-interactive span');
    assert.equal(opt.querySelector('.mini')?.getAttribute('aria-hidden'),'true');
    assert(opt.querySelector('img[src^="images_vf/"]'),'offline French thumbnail should be available');
    assert(opt.querySelector('.t')?.textContent.includes(i?'Navi de la MaxTac':'Sécurité Corpo'),'name inside the touch target');
    assert(opt.getAttribute('aria-label')?.length>0);
  }
  if(peek){
    const button=app.querySelector('[data-peek]');assert(button);
    button.onclick();assert(app.querySelector('.choice-peek-shield'),'peek overlay');
    app.querySelector('#returnToDecision').onclick();
    assert(!app.querySelector('.choice-peek-shield'),'peek has returned to original choices');
  }
  options[selected].onclick();
  if(max>1){
    assert.equal(options[selected].getAttribute('aria-pressed'),'true','multi-select accessible active state');
    const confirm=app.querySelector('[data-ok]');assert(!confirm.disabled);
    confirm.onclick();
  }
  const answer=await pending;
  assert.equal(answer.length,1);
  assert.equal(answer[0],selected===0?201:202);
  assert(!app.querySelector('.scrim'),'sheet should close after selection');
}
(async()=>{
  const example=miniHTML('corpo-security',{inst:inst('corpo-security'),live:true,decorative:true});
  assert(example.trim().startsWith('<span'),'decorative card must never create a nested button');
  assert(example.trim().endsWith('</span>'));
  await runChoice(0,1,1,false);await runChoice(1,1,1,true);
  await runChoice(0,2,1,false);
  assert(html.includes('.sheet .body .choice-target{'),'scoped mobile choice layout exists');
  assert(html.includes('grid-template-columns:58px minmax(0,1fr) 22px'));
  assert(html.includes('decorative:true})}<span class="t">'),'Gig and deck options must use passive cards');
  console.log(JSON.stringify({version:'2.5.3',cardOptions:2,clickedBoth:true,
    peekAndReturn:'PASS',multiSelection:'PASS',noNestedButtons:'PASS',
    offlineFrenchThumbnail:'PASS',mobileTargetCSS:'PRESENT'},null,2));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
