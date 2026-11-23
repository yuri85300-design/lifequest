'use strict';
/* NIGHTMARE training contract on the PUBLISHED runtime (2.7.5+).
 * Training is open; a trained champion is only ever installed by an explicit,
 * reversible player decision, and only if it beat the champion in validation.
 * The certification flag stays false: nothing is labelled officially certified.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const file=process.env.PRIME_RUNTIME||'prime_v276_runtime.html';
const html=fs.readFileSync(path.join(__dirname,file),'utf8');
const count=s=>html.split(s).length-1;
assert.equal(count('const NIGHTMARE_TRAINING_CERTIFIED = false;'),1,'Certification flag must stay false');
assert.equal(count('const NIGHTMARE_TRAINING_EXPERIMENTAL = true;'),1,'Training gate missing');
assert.equal(count('if(!NIGHTMARE_TRAINING_CERTIFIED && !NIGHTMARE_TRAINING_EXPERIMENTAL)'),1,'Train control must be gated explicitly');
assert.equal(count('id="labTrain" disabled'),0,'Train control may not remain disabled');
assert.equal(count("mode:'EXPERIMENTAL_UNCERTIFIED'"),1,'Training output must be labelled');
assert.equal(count("store.set('nightmareSandboxTraining',sandboxReport)"),1,'Training results must persist separately');
// The training handler itself never writes the champion.
const sandbox=html.indexOf('if(!NIGHTMARE_TRAINING_CERTIFIED){\n        const sandboxReport=');
const certifiedBranch=html.indexOf('S.brain={rulesHash:PRETRAINED_BRAIN.rulesHash,weights:S.brain.weights,plans:result.plans');
assert.ok(sandbox>=0 && certifiedBranch>sandbox,'Training branch must precede any automatic promotion');
const block=html.slice(sandbox,certifiedBranch);
assert.match(block,/return;/,'Training branch must return before automatic promotion');
assert.doesNotMatch(block,/store\.set\('championBrain'/,'Training cannot install a champion by itself');
// Adoption: explicit button, validated challenger only, previous champion kept, original restorable.
const adopt=html.slice(html.indexOf('adopt.onclick=()=>{'),html.indexOf('restore.onclick=()=>{'));
assert.ok(adopt.length>100,'Adoption handler missing');
assert.match(adopt,/const r=pendingChampion\(\);if\(!r\|\|running\)/,'Only a pending validated challenger can be adopted');
assert.match(html,/function pendingChampion\(\)\{[\s\S]{0,200}r\.upgraded&&!r\.adopted&&r\.plans/,'Pending challenger must have passed validation');
assert.match(adopt,/store\.set\('championBrainPrevious',previous\)/,'Previous champion must be kept');
assert.match(html,/restore\.onclick=\(\)=>\{[\s\S]{0,300}store\.del\('championBrain'\)[\s\S]{0,80}S\.brain=defaultBrain\(\)/,'Original champion must be restorable');
// Automatic evolution: only a validated challenger, only when the player left the option on.
assert.ok(html.includes('if(result.upgraded&&S.forgeAuto)autoAdopt=true;'),'Automatic adoption must require validation and the player option');
assert.ok(html.includes("forgeAuto: store.get('nightmareAutoEvolve', true) !== false"),'Automatic evolution option missing');
// Promotion threshold and per-session seed.
assert.ok(html.includes('const upgraded=incompleteValidation===0 && (wins+draws*.5)>=49;'),'Validation threshold changed');
assert.ok(html.includes('},()=>S.cancelTraining,runSeed);'),'Each session must use its own seed');
assert.ok(html.includes('const result=await DeckPlanAI.trainLeague(Object.values(PRESETS),300,'),'Existing bounded trainer must remain');
console.log('PASS NIGHTMARE training contract ('+file+'): training open, adoption validated (manual or automatic) and reversible, certified=false');
