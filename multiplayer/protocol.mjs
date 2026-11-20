/* 7 GIGS — multiplayer security primitives.
   This is infrastructure for a future authenticated server, not a live PvP mode.
   The server MUST compute legalActions from its own authoritative state. */
export function canonicalJSON(value) {
  const seen = new WeakSet();
  function clean(v,depth=0){
    if(depth>12)throw new Error('Nested input too deep');
    if(v===null||typeof v==='string'||typeof v==='boolean')return v;
    if(typeof v==='number'&&Number.isFinite(v))return v;
    if(Array.isArray(v)){
      if(v.length>100)throw new Error('Oversized array');
      return v.map(x=>clean(x,depth+1));
    }
    if(typeof v!=='object')throw new Error('Unsupported input');
    if(seen.has(v))throw new Error('Cycles are forbidden');
    seen.add(v);
    const keys=Object.keys(v).sort();
    if(keys.length>40)throw new Error('Too many properties');
    const result={};
    for(const k of keys){
      if(['__proto__','constructor','prototype'].includes(k))throw new Error('Unsafe property name');
      result[k]=clean(v[k],depth+1);
    }
    seen.delete(v);
    return result;
  }
  const serialized=JSON.stringify(clean(value));
  if(serialized.length>4096)throw new Error('Oversized packet');
  return serialized;
}
export function validateLegalIntent(packet,{matchId,seat,expectedSeq,legalActions}) {
  if(typeof packet!=='object'||packet===null||Array.isArray(packet))return null;
  if(Object.keys(packet).sort().join(',')!=='action,matchId,seq')return null;
  if(typeof matchId!=='string'||matchId.length<8||packet.matchId!==matchId)return null;
  if(seat!==0&&seat!==1)return null;
  if(!Number.isSafeInteger(expectedSeq)||packet.seq!==expectedSeq)return null;
  if(!Array.isArray(legalActions))return null;
  let proposed;
  try{proposed=canonicalJSON(packet.action);}catch(_){return null;}
  // Return the SERVER-GENERATED action. Never execute an object from the network.
  for(const action of legalActions){
    try{if(canonicalJSON(action)===proposed)return action;}catch(_){/* invalid authoritative shape */}
  }
  return null;
}
const publicCard=card=>{
  if(!card)return null;
  return {
    uid:card.uid??null,
    id:card.faceDown?null:card.id??null,
    hidden:!!card.faceDown,
    ready:!!card.ready,
    gear:(Array.isArray(card.gear)?card.gear:[]).map(g=>({
      uid:g.uid??null,id:g.faceDown?null:g.id??null,hidden:!!g.faceDown
    }))
  };
};
export function viewForSeat(state,seat){
  if(!state||!Array.isArray(state.players)||state.players.length!==2||![0,1].includes(seat))
    throw new Error('Invalid authoritative game state or seat');
  const players=state.players.map((p,i)=>({
    seat:i,
    own:i===seat,
    handCount:(p.hand||[]).length,
    hand:i===seat?(p.hand||[]).map(c=>({uid:c.uid,id:c.id})):null,
    deckCount:(p.deck||[]).length,
    field:(p.field||[]).map(publicCard),
    legends:(p.legends||[]).map(l=>({
      uid:l.uid??null,id:l.faceUp?l.id:null,faceUp:!!l.faceUp,
      ready:!!l.ready,
      gear:l.faceUp?(l.gear||[]).map(publicCard):[]
    })),
    gigs:(p.gigs||[]).map(d=>({uid:d.uid??null,sides:d.sides,value:d.value})),
    eddiesReady:(p.eddies||[]).filter(e=>e.ready).length,
    trash:(p.trash||[]).map(c=>({id:c.id,uid:c.uid}))
  }));
  return {phase:state.phase,turn:state.turn,active:state.active,
    overtime:!!state.overtime,players};
}
/* Deployment gates: HTTPS/WSS, signed identity, rate limits, replay protection,
   action timeouts, persistence, reconnection and audit logging must be supplied
   by an actual server BEFORE this may be exposed to players. */
