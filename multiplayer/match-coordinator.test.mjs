import assert from 'node:assert/strict';
import {MatchCoordinator} from './match-coordinator.mjs';
const p0='player-zero-strong-session-key',p1='player-one-strong-session-key';
const state={phase:'main',turn:1,active:0,players:[
 {hand:[{uid:1,id:'self-secret'}],deck:[{uid:2,id:'self-deck'}],field:[],
  legends:[{uid:3,id:'self-legend',faceUp:false}],gigs:[],eddies:[],trash:[]},
 {hand:[{uid:4,id:'enemy-secret'}],deck:[{uid:5,id:'enemy-deck'}],field:[],
  legends:[{uid:6,id:'enemy-legend',faceUp:false}],gigs:[],eddies:[],trash:[]}
]};
let executed=0,pendingResolve;
const engine={
 s:state,
 legalActions(seat){return seat===this.s.active?[{type:'end'}]:[]},
 async doAction(seat,action){
  executed++;
  assert.equal(action.type,'end');
  this.s.active=1-seat;
  return {status:'ongoing'};
 }
};
const m=new MatchCoordinator({engine,tokens:[p0,p1],matchId:'prime-duel-123'});
assert.equal(m.view('untrusted'),null);
assert.equal(m.view(p0).seat,0);
assert.equal(m.view(p1).seat,1);
assert(!JSON.stringify(m.view(p0)).includes('enemy-secret'));
assert(!JSON.stringify(m.view(p1)).includes('self-secret'));
assert.equal((await m.submit('unknown',{matchId:'prime-duel-123',seq:0,action:{type:'end'}})).code,'UNAUTHORIZED');
assert.equal((await m.submit(p1,{matchId:'prime-duel-123',seq:0,action:{type:'end'}})).code,'NOT_YOUR_TURN');
assert.equal((await m.submit(p0,{matchId:'prime-duel-123',seq:0,action:{type:'steal',count:100}})).code,'ILLEGAL_OR_STALE_ACTION');
assert.equal((await m.submit(p0,{matchId:'prime-duel-123',seq:0,action:{type:'end'},seat:1})).code,'ILLEGAL_OR_STALE_ACTION');
let out=await m.submit(p0,{matchId:'prime-duel-123',seq:0,action:{type:'end'}});
assert.equal(out.ok,true);
assert.equal(out.seq,1);
assert.equal(executed,1);
assert.equal((await m.submit(p0,{matchId:'prime-duel-123',seq:0,action:{type:'end'}})).code,'NOT_YOUR_TURN');
assert.equal((await m.submit(p1,{matchId:'prime-duel-123',seq:0,action:{type:'end'}})).code,'ILLEGAL_OR_STALE_ACTION');
out=await m.submit(p1,{matchId:'prime-duel-123',seq:1,action:{type:'end'}});
assert.equal(out.ok,true);assert.equal(out.seq,2);assert.equal(executed,2);
const slowState={phase:'main',turn:1,active:0,players:state.players.map(p=>({...p}))};
const slowEngine={s:slowState,legalActions:()=>[{type:'end'}],async doAction(){await new Promise(r=>{pendingResolve=r});this.s.active=1;}};
const slow=new MatchCoordinator({engine:slowEngine,tokens:[p0,p1],matchId:'another-match'});
const req=slow.submit(p0,{matchId:'another-match',seq:0,action:{type:'end'}});
assert.equal((await slow.submit(p0,{matchId:'another-match',seq:0,action:{type:'end'}})).code,'ACTION_IN_PROGRESS');
pendingResolve();assert.equal((await req).ok,true);
slowState.active=0;
const badEngine={s:slowState,legalActions:()=>[{type:'end'}],async doAction(){throw Error('partial state may be bad')}};
const bad=new MatchCoordinator({engine:badEngine,tokens:[p0,p1],matchId:'quarantine-match'});
assert.equal((await bad.submit(p1,{matchId:'quarantine-match',seq:0,action:{type:'end'}})).code,'NOT_YOUR_TURN');
slowState.active=0;
assert.equal((await bad.submit(p0,{matchId:'quarantine-match',seq:0,action:{type:'end'}})).code,'ENGINE_ERROR_QUARANTINED');
assert.equal((await bad.submit(p0,{matchId:'quarantine-match',seq:0,action:{type:'end'}})).code,'ENGINE_QUARANTINED');
console.log(JSON.stringify({serverMatchCoordinator:'PASS',sessionAuth:'PASS',serverLegalMoves:'PASS',
 antiReplay:'PASS',antiConcurrent:'PASS',separatePrivateViews:'PASS',engineErrorQuarantine:'PASS',
 onlineDeployment:'NOT_CONFIGURED'}));
