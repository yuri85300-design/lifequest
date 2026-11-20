import assert from 'node:assert/strict';
import {canonicalJSON,validateLegalIntent,viewForSeat} from './protocol.mjs';
const matchId='match-123456';
const legal=[{type:'play',uid:17,target:{kind:'unit',uid:34}},{type:'end'}];
const base={matchId,seq:3,action:{type:'end'}};
assert.equal(validateLegalIntent(base,{matchId,seat:0,expectedSeq:3,legalActions:legal}),legal[1]);
assert.equal(validateLegalIntent({...base,seq:2},{matchId,seat:0,expectedSeq:3,legalActions:legal}),null);
assert.equal(validateLegalIntent({...base,matchId:'other-game'}, {matchId,seat:0,expectedSeq:3,legalActions:legal}),null);
assert.equal(validateLegalIntent({...base,action:{type:'steal',count:9}},{matchId,seat:0,expectedSeq:3,legalActions:legal}),null);
assert.equal(validateLegalIntent({...base,admin:true},{matchId,seat:0,expectedSeq:3,legalActions:legal}),null);
assert.equal(validateLegalIntent({...base,action:{uid:17,type:'play',target:{uid:34,kind:'unit'}}},
  {matchId,seat:0,expectedSeq:3,legalActions:legal}),legal[0]);
assert.equal(canonicalJSON({b:2,a:1}),canonicalJSON({a:1,b:2}));
assert.throws(()=>canonicalJSON(JSON.parse('{"__proto__":1}')));
const state={phase:'main',turn:3,active:0,players:[
  {hand:[{uid:17,id:'player-private'}],deck:[{id:'deck-secret'}],
    field:[{uid:21,id:'visible',gear:[],ready:true}],legends:[{uid:5,id:'secret-legend',faceUp:false,gear:[]}],
    gigs:[{uid:5,sides:8,value:4}],eddies:[{ready:true}],trash:[]},
  {hand:[{uid:12,id:'opponent-private'}],deck:[{id:'opponent-deck'}],
    field:[{uid:33,id:'hidden-unit',faceDown:true,gear:[],ready:true}],legends:[{uid:42,id:'opponent-legend',faceUp:false,gear:[]}],
    gigs:[],eddies:[],trash:[]}
]};
const view=viewForSeat(state,0),json=JSON.stringify(view);
assert(view.players[0].hand?.some(x=>x.id==='player-private'));
assert.equal(view.players[1].hand,null);
assert.equal(view.players[1].handCount,1);
for(const forbidden of ['opponent-private','opponent-deck','hidden-unit','opponent-legend','secret-legend','deck-secret'])
  assert(!json.includes(forbidden),'Leaked hidden data: '+forbidden);
assert.equal(view.players[1].field[0].id,null);
assert.equal(viewForSeat(state,1).players[0].hand,null);
assert.throws(()=>viewForSeat(state,2));
console.log(JSON.stringify({protocol:'PASS',serverLegalActions:'PASS',antiReplay:'PASS',
  hiddenInfo:'PASS',redactedLegends:'PASS',noNetworkDeployment:'PENDING'}));
