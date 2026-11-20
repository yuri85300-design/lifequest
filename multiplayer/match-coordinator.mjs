/* 7 GIGS — authoritative in-process PvP match coordinator.
   No listening socket or matchmaking: NOT a public online PvP service.
   Must be hosted behind TLS, authentication, rate limits and external auditing. */
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {validateLegalIntent,viewForSeat} from './protocol.mjs';

function sameSecret(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length<20||b.length<20)return false;
  const x=Buffer.from(a,'utf8'),y=Buffer.from(b,'utf8');
  return x.length===y.length&&timingSafeEqual(x,y);
}
export class MatchCoordinator {
  #engine;
  #tokens;
  #seq=0;
  #busy=false;
  #finished=false;
  #quarantined=false;
  #actions=0;
  constructor({engine,tokens,matchId=randomUUID(),maxActions=1200}={}){
    if(!engine||typeof engine.legalActions!=='function'||
      typeof engine.doAction!=='function'||!engine.s||!Array.isArray(engine.s.players)||
      engine.s.players.length!==2)throw new Error('Authoritative game engine required');
    if(!Array.isArray(tokens)||tokens.length!==2||tokens[0]===tokens[1]||
      !tokens.every(s=>typeof s==='string'&&s.length>=20))throw new Error('Two distinct session secrets required');
    if(typeof matchId!=='string'||matchId.length<8||!Number.isSafeInteger(maxActions)||maxActions<1)
      throw new Error('Invalid match parameters');
    this.#engine=engine;
    this.#tokens=tokens.slice();
    this.matchId=matchId;
    this.maxActions=maxActions;
  }
  #seat(secret){
    if(sameSecret(secret,this.#tokens[0]))return 0;
    if(sameSecret(secret,this.#tokens[1]))return 1;
    return null;
  }
  view(secret){
    const seat=this.#seat(secret);
    if(seat===null)return null;
    return Object.freeze({matchId:this.matchId,seq:this.#seq,finished:this.#finished,
      quarantined:this.#quarantined,seat,publicState:viewForSeat(this.#engine.s,seat)});
  }
  async submit(secret,packet){
    // No client-supplied "seat": map authenticated session to its fixed seat.
    const seat=this.#seat(secret);
    if(seat===null)return {ok:false,code:'UNAUTHORIZED'};
    if(this.#busy)return {ok:false,code:'ACTION_IN_PROGRESS'};
    if(this.#finished)return {ok:false,code:'MATCH_FINISHED'};
    if(this.#quarantined)return {ok:false,code:'ENGINE_QUARANTINED'};
    if(this.#actions>=this.maxActions)return {ok:false,code:'LIMIT_REACHED'};
    if(this.#engine.s.active!==seat)return {ok:false,code:'NOT_YOUR_TURN'};
    const legal=this.#engine.legalActions(seat);
    const action=validateLegalIntent(packet,{matchId:this.matchId,seat,
      expectedSeq:this.#seq,legalActions:legal});
    if(!action)return {ok:false,code:'ILLEGAL_OR_STALE_ACTION'};
    this.#busy=true;
    try{
      // The original SERVER action is used, never the untrusted packet object.
      const result=await this.#engine.doAction(seat,action);
      this.#actions++;this.#seq++;
      if(result?.status==='complete'||this.#engine.s.winner!==null&&
         this.#engine.s.winner!==undefined)this.#finished=true;
      return {ok:true,seq:this.#seq,finished:this.#finished,
        publicState:viewForSeat(this.#engine.s,seat)};
    }catch(err){
      // Unknown exceptions may have partially mutated state; quarantine it.
      this.#quarantined=true;
      return {ok:false,code:'ENGINE_ERROR_QUARANTINED'};
    }finally{this.#busy=false;}
  }
}
/* Launch gate: deploy only after server-side rules certification, HTTPS/WSS,
   identity provider, replay logs, deadlines, reconnect and abuse protection. */
