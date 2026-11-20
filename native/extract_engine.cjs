'use strict';
/**
 * Rebuild the standalone test engine from the actual Android/Web runtime.
 * Fails closed if source markers change. No certification claim is made.
 */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=__dirname;
const html=fs.readFileSync(path.join(root,'prime_v220_runtime.html'),'utf8');
const scriptStart=html.indexOf('<script>');
const engineBegin=html.indexOf('//  MOTEUR DE JEU',scriptStart);
const interfaceMarker=html.indexOf('//  SEPT GIGS — interface',engineBegin);
if(scriptStart<0||engineBegin<0||interfaceMarker<0)throw Error('Extraction impossible : marqueurs introuvables');
const start=html.lastIndexOf('// ============================================================================',engineBegin);
const end=html.lastIndexOf('// ============================================================================',interfaceMarker);
if(start<scriptStart||end<=start)throw Error('Bornes du moteur invalides');
const script=html.slice(start,end);
new vm.Script(script,{filename:'generated-engine.js'});
const output=path.join(root,'engine.js');
fs.writeFileSync(output,script+'\n','utf8');
console.log('Moteur d’audit extrait:',output,script.length,'caractères');
