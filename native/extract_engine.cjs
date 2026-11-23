'use strict';
/**
 * Rebuild the standalone test engine (native/engine.js) from the runtime that
 * is ACTUALLY PUBLISHED. It uses exactly the same bounds as build_ota_content.py,
 * so the engine tested by every oracle is byte-for-byte the shipped engine.
 * Fails closed if source markers change. No certification claim is made.
 *
 * Until 2.7.4 this extracted prime_v220_runtime.html: rule fixes landed in that
 * old copy and in engine.js while the published 2.7.x runtime kept the bugs.
 */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=__dirname;
const RELEASE_RUNTIME=process.env.PRIME_RUNTIME||'prime_v276_runtime.html';
const html=fs.readFileSync(path.join(root,RELEASE_RUNTIME),'utf8');
const START='/* Android: exporting JSON via the system document picker';
const END='// ============================================================================\n//  SEPT GIGS — interface';
const start=html.indexOf(START);
const end=html.indexOf(END,start);
if(start<0||end<=start)throw Error('Extraction impossible : marqueurs introuvables dans '+RELEASE_RUNTIME);
const script=html.slice(start,end);
new vm.Script(script,{filename:'generated-engine.js'});
const output=path.join(root,'engine.js');
const check=process.argv.includes('--check');
if(check){
  const current=fs.readFileSync(output,'utf8');
  if(current!==script){console.error('native/engine.js n’est PAS le moteur publié par '+RELEASE_RUNTIME+'. Lancez : node native/extract_engine.cjs');process.exit(1);}
  console.log('native/engine.js = moteur publié ('+RELEASE_RUNTIME+')');
}else{
  fs.writeFileSync(output,script,'utf8');
  console.log('Moteur d’audit extrait de',RELEASE_RUNTIME,':',output,script.length,'caractères');
}
