'use strict';
/* End-to-end and property checks for the 2.8.1 tactical story expansion. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]||'/tmp/prime281-story');
const tests=[],errors=[];let browser,server;
function assert(ok,message){if(!ok)throw Error(message);}
async function test(name,fn){try{await fn();tests.push({name,status:'PASS'});}catch(e){tests.push({name,status:'FAIL',reason:String(e.stack||e).slice(0,900)});errors.push(name+': '+e.message);}}
async function main(){
  assert(fs.existsSync(path.join(root,'index.html')),'Built 2.8.1 index.html missing');
  server=http.createServer((req,res)=>{
    const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
      res.writeHead(404);res.end();return;
    }
    res.writeHead(200,{'Content-Type':p.endsWith('.html')?'text/html;charset=utf-8':'application/octet-stream'});
    fs.createReadStream(p).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    baseURL:'http://127.0.0.1:'+server.address().port,locale:'fr-FR'});
  const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push('PAGEERROR '+e.message));
  await test('Home and story first open, 15 chapters, chapter two locked',async()=>{
    await page.goto('/index.html',{waitUntil:'domcontentloaded'});
    await page.locator('.hub-home').waitFor({timeout:12000});
    await page.locator('[data-nav="story"]').first().click();
    assert(await page.locator('.story-mission').count()===15,'Story index must show 15 acts');
    assert(await page.locator('[data-story-chapter="0"]').isEnabled(),'First chapter should unlock');
    assert(await page.locator('[data-story-chapter="1"]').isDisabled(),'Second chapter must remain locked');
    assert((await page.locator('.story-hero').innerText()).includes('LES CENDRES'),'Story title missing');
  });
  await test('All 150 cards, 300 original quizzes, 150 tactical decisions and 15 chapter pairs valid',async()=>{
    const result=await page.evaluate(()=>{
      const data=window.StoryCampaign,cards=window.CARDS;
      const chapters=data.build(cards),all=chapters.flatMap(c=>c.cards),errors=[],uniquePairs=new Set();
      if(chapters.length!==15)errors.push('wrong chapter count');
      if(all.length!==150||new Set(all).size!==150)errors.push('duplicate or missing');
      for(const id of all){
        const card=cards[id],d=data.info(card);
        if(!d.name||!d.effect||!d.trigger)errors.push('missing lesson '+id);
        const practice=data.tacticalQuiz(card);
        if(!practice||practice.options.length!==3||practice.correct<0||practice.correct>2||
          new Set(practice.options).size!==3||!practice.why)errors.push('invalid tactical decision '+id);
        const allies=data.partners(cards,id,3);
        if(allies.length!==3||new Set(allies.map(a=>a.id)).size!==3||allies.some(a=>!cards[a.id]||a.id===id||!a.reason))errors.push('invalid partner advice '+id);
        for(const step of [0,1]){
          const q=data.quiz(card,step,cards);
          if(q.correct<0||q.correct>=q.options.length||new Set(q.options).size!==q.options.length)
            errors.push('broken question '+id+'/'+step);
        }
      }
      for(const c of chapters){
        const pair=data.chapterPair(chapters,c.index,cards);
        if(!pair||!c.cards.includes(pair.a)||!c.cards.includes(pair.b)||pair.a===pair.b||!pair.reason||pair.checks.length!==3)
          errors.push('invalid chapter-local pair '+c.id);
        else uniquePairs.add([pair.a,pair.b].sort().join(':'));
      }
      if(uniquePairs.size!==15)errors.push('chapter pair duplication');
      return {chapters:chapters.length,cards:all.length,questions:all.length*2,
        practices:all.length,pairs:uniquePairs.size,errors};
    });
    assert(!result.errors.length,'Card data broken: '+result.errors.slice(0,12).join('; '));
    assert(result.cards===150&&result.questions===300&&result.practices===150&&result.pairs===15,
      'Complete set + applied training coverage absent');
  });
  await test('First card: a wrong answer cannot advance and two correct answers persist',async()=>{
    await page.locator('[data-story-chapter="0"]').click();
    assert(await page.locator('.story-card').count()===10,'First chapter should contain exactly 10 card dossiers');
    await page.locator('[data-story-card="0"]').click();
    assert(await page.locator('.story-associate').count()===3,'Three partner lessons missing from a card dossier');
    const ally=page.locator('[data-story-ally]').first();await ally.click();
    assert(await page.locator('.scrim .sheet').count()>0,'Partner card cannot be inspected');
    const close=page.locator('.scrim [data-close]').first();if(await close.count())await close.click();
    const id=await page.evaluate(()=>window.StoryCampaign.build(window.CARDS)[0].cards[0]);
    let correct=await page.evaluate(id=>window.StoryCampaign.quiz(window.CARDS[id],0,window.CARDS).correct,id);
    await page.locator('[data-story-answer="'+((correct+1)%4)+'"]').click();
    let state=await page.evaluate(id=>JSON.parse(localStorage.getItem('septgigs.storyCindersV1')||'{}').steps?.[id]||0,id);
    assert(state===0,'Incorrect answer was accepted');
    await page.locator('[data-story-answer="'+correct+'"]').click();
    correct=await page.evaluate(id=>window.StoryCampaign.quiz(window.CARDS[id],1,window.CARDS).correct,id);
    await page.locator('[data-story-answer="'+correct+'"]').click();
    assert(await page.locator('.story-reveal').count()===1,'Mastered card feedback missing');
    assert(await page.locator('#storyPractice').isEnabled(),'Tactical practice should unlock after two quizzes');
    await page.locator('#storyPractice').click();
    const tactical=await page.evaluate(id=>window.StoryCampaign.tacticalQuiz(window.CARDS[id]),id);
    assert(await page.locator('[data-story-practice-answer]').count()===3,'Three decisions required');
    await page.locator('[data-story-practice-answer="'+((tactical.correct+1)%3)+'"]').click();
    assert(!(await page.evaluate(id=>JSON.parse(localStorage.getItem('septgigs.storyCindersV1')||'{}').practices?.[id],id)),
      'Wrong tactical choice must never count');
    await page.locator('[data-story-practice-answer="'+tactical.correct+'"]').click();
    assert(await page.evaluate(id=>JSON.parse(localStorage.getItem('septgigs.storyCindersV1')||'{}').practices?.[id]===true,id),
      'Correct tactical decision was not stored');

    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-nav="story"]').first().click();
    await page.locator('[data-story-chapter="0"]').click();
    assert((await page.locator('[data-story-card="0"]').getAttribute('class')).includes('done'),'Card progress lost');
    assert((await page.locator('.story-panel').first().innerText()).includes('décisions tactiques'),'Practical chapter progress missing');
  });
  await test('Story synergy and narrative choice independently saved',async()=>{
    await page.locator('#storyCombo').click();
    await page.locator('[data-story-combo-answer="1"]').click();
    assert((await page.locator('#storyComboMsg').innerText()).includes('Non'),'Wrong combo answer not rejected');
    await page.locator('[data-story-combo-answer="0"]').click();
    assert(await page.locator('#storyCombo').isDisabled(),'Correct combo not saved');
    await page.locator('[data-story-choice="1"]').click();
    assert((await page.locator('#storyChoiceMsg').innerText()).length>10,'Story consequence missing');
    assert(await page.locator('#storyComplete').isDisabled(),'Chapter prematurely finishable');
    assert(await page.locator('[data-story-local-pair]').count()===2,'Chapter-specific pair workshop unavailable');
  });
  await test('15 chapters require 150 cards and 150 tactical decisions before sealing',async()=>{
    const result=await page.evaluate(()=>{
      const S=window.StoryCampaign,chapters=S.build(window.CARDS);
      let state=S.clean(null,chapters),errors=[];
      if(S.available(chapters,state,1))errors.push('chapter two unlocked before act one');
      for(const c of chapters){
        for(const id of c.cards){
          state=S.advance(chapters,state,id,0);
          state=S.advance(chapters,state,id,1);
          state=S.practice(chapters,state,id,S.tacticalQuiz(window.CARDS[id]).correct,window.CARDS);
        }
        state=S.comboLearn(chapters,state,c.id);
        state=S.choose(chapters,state,c.id,1);
        state=S.seal(chapters,state,c.id);
        if(!state.complete.includes(c.id))errors.push('chapter not sealed '+c.id);
      }
      localStorage.setItem('septgigs.storyCindersV1',JSON.stringify(state));
      return {total:state.complete.length,mastered:Object.values(state.steps).filter(x=>x===2).length,
        choices:Object.keys(state.choices).length,combos:state.combos.length,
        practiced:Object.keys(state.practices).length,errors};
    });
    assert(!result.errors.length,'Story progression invariant: '+result.errors);
    assert(result.total===15&&result.mastered===150&&result.practiced===150&&result.choices===15&&result.combos===15,
      'Story achievements incomplete');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-nav="story"]').first().click();
    assert(await page.locator('.story-mission.done').count()===15,'Completed chapters not reflected');
    assert((await page.locator('.story-reveal').first().innerText()).includes('ÉPILOGUE'),
      'End of story not shown');
  });
  await test('Existing 2.8.0 progress migrates without revoking completed chapters',async()=>{
    const result=await page.evaluate(()=>{
      const S=window.StoryCampaign,chapters=S.build(window.CARDS);
      let old=S.clean(null,chapters);
      for(const c of chapters){
        for(const id of c.cards){
          old=S.advance(chapters,old,id,0);
          old=S.advance(chapters,old,id,1);
        }
        old=S.comboLearn(chapters,old,c.id);
        old=S.choose(chapters,old,c.id,0);
        // Simulate the saved v1 schema as it existed before tactical practice.
        const v1={schema:1,steps:old.steps,choices:old.choices,combos:old.combos,
          complete:[...chapters.slice(0,chapters.indexOf(c)+1).map(x=>x.id)]};
        old=S.clean(v1,chapters);
        if(old.complete.length!==chapters.indexOf(c)+1)return {error:'migration lost chapter '+c.id};
      }
      const again=S.clean(old,chapters);
      return {first:old.complete.length,second:again.complete.length,legacy:again.legacyComplete.length};
    });
    assert(result.first===15&&result.second===15&&result.legacy===15,
      'Previously earned chapters lost during 2.8.1 migration: '+JSON.stringify(result));
  });
  await test('New 2.8.1 chapters cannot be sealed without completing practical scenarios',async()=>{
    const result=await page.evaluate(()=>{
      const S=window.StoryCampaign,chapters=S.build(window.CARDS),c=chapters[0];let x=S.clean(null,chapters);
      for(const id of c.cards){
        x=S.advance(chapters,x,id,0);
        x=S.advance(chapters,x,id,1);
      }
      x=S.comboLearn(chapters,x,c.id);x=S.choose(chapters,x,c.id,0);
      const before=S.seal(chapters,x,c.id);
      return {before:before.complete.length,practiced:Object.keys(before.practices).length};
    });
    assert(result.before===0&&result.practiced===0,'New story bypasses 150-card tactical gate');
  });
  await test('Garbage progress cannot unlock an unearned chapter or victory',async()=>{
    const data=await page.evaluate(()=>{
      const S=window.StoryCampaign,chapters=S.build(window.CARDS);
      const fake=S.clean({steps:{bogus:2},complete:chapters.map(c=>c.id),combos:chapters.map(c=>c.id),
        choices:Object.fromEntries(chapters.map(c=>[c.id,1])),duels:['fake']},chapters);
      const blank=S.clean(null,chapters);
      const ignored=S.duelResult(chapters,blank,chapters[0].id,{winner:0,status:'incomplete',reason:'time limit'});
      const draw=S.duelResult(chapters,blank,chapters[0].id,{winner:-1,status:'done',reason:'Draw'});
      const real=S.duelResult(chapters,blank,chapters[0].id,{winner:0,status:'done',reason:'Seven gigs'});
      return {badChapters:fake.complete.length,badCards:Object.keys(fake.steps).length,
        badDuels:fake.duels.length,noIncomplete:ignored.duels.length===0,noDraw:draw.duels.length===0,
        win:real.duels.includes(chapters[0].id)};
    });
    assert(data.badChapters===0&&data.badCards===0&&data.badDuels===0,'Corrupt saved state unlocked content');
    assert(data.noIncomplete&&data.noDraw&&data.win,'Real-duel gating logic broken');
  });
  await test('All companion legacy navigation remains in the original home',async()=>{
    await page.reload({waitUntil:'domcontentloaded'});
    const routes=await page.locator('.hub-home [data-nav]').evaluateAll(x=>[...new Set(x.map(y=>y.dataset.nav))]);
    for(const route of ['story','campaign','academy','cards','decks','collection','setup'])
      assert(routes.includes(route),'Legacy route disappeared: '+route);
  });
  await ctx.close();
}
(async()=>{
  try{await main();}catch(e){errors.push('TEST HARNESS '+e.stack);}
  finally{
    try{await browser?.close();}catch(_){}
    try{server?.close();}catch(_){}
    const result={status:errors.length?'FAIL':'PASS',suite:'Les Cendres du Signal 2.8.1',tests,errors,
      scenarios:tests.length,scenarioFailures:tests.filter(t=>t.status==='FAIL').length};
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(errors.length)process.exitCode=1;
  }
})();
