'use strict';
/* Protect independent sandbox training from false semantic certification. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'prime_v220_runtime.html'),'utf8');
const count=s=>html.split(s).length-1;
assert.equal(count('const NIGHTMARE_TRAINING_CERTIFIED = false;'),1,'Certified gate must remain false');
assert.equal(count('const NIGHTMARE_TRAINING_EXPERIMENTAL = true;'),1,'Explicit experimental gate missing');
assert.equal(count('if(!NIGHTMARE_TRAINING_CERTIFIED && !NIGHTMARE_TRAINING_EXPERIMENTAL)'),1,
 'Experimental train control must be gated explicitly');
assert.equal(count('id="labTrain" disabled'),0,'Train control may not remain disabled');
assert.equal(count("mode:'EXPERIMENTAL_UNCERTIFIED'"),1,'Experimental output must be labelled');
assert.equal(count("store.set('nightmareSandboxTraining',sandboxReport)"),1,
 'Experimental results must persist separately');
const sandbox=html.indexOf('if(!NIGHTMARE_TRAINING_CERTIFIED){\n        const sandboxReport=');
const champion=html.indexOf('S.brain={rulesHash:PRETRAINED_BRAIN.rulesHash,weights:S.brain.weights,plans:result.plans');
assert.ok(sandbox>=0 && champion>sandbox,'Sandbox must precede official champion promotion');
const block=html.slice(sandbox,champion);
assert.match(block,/return;/,'Uncertified branch must return before champion update');
assert.doesNotMatch(block,/store\.set\('championBrain'/,'Sandbox cannot persist official champion');
assert.ok(html.includes('const result=await DeckPlanAI.trainLeague(Object.values(PRESETS),300,'),
 'Existing bounded trainer must remain');
console.log('PASS NIGHTMARE experimental training contract: certified=false; UI enabled; sandbox isolation');
