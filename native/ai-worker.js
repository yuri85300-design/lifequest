'use strict';
// Dedicated tactical worker; game effects and card definitions are loaded from
// the same engine bundle as the visible runtime. No independent rule fork.
self.window=self;
importScripts('engine.js');
self.onmessage=async event=>{
  const p=event.data||{},id=p.id;
  try{
    const state=p.state;
    if(!state||!Array.isArray(state.players)||state.players.length!==2)throw Error('Invalid state');
    const g=new self.Game(state,[self.FastPolicy,self.FastPolicy],{sim:true});
    const strategy=self.makeAI(p.level==='expert'?'expert':'normal');
    const a=p.method==='react'
      ?await strategy.react(g,p.side,p.attack,p.actions||[])
      :await strategy.mainAction(g,p.side,p.actions||[]);
    // The main thread will independently check the exact legal action.
    self.postMessage({id,action:a||null});
  }catch(error){self.postMessage({id,error:String(error)})}
};
self.postMessage({ready:true});
