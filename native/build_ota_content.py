#!/usr/bin/env python3
"""Prepare an in-app GitHub update: game HTML+Worker only, NO APK/images."""
import argparse,hashlib,json,pathlib,subprocess,zipfile

def build(args):
    source=pathlib.Path(args.source).read_text(encoding="utf-8")
    start=source.index('/* Android: exporting JSON via the system document picker')
    end=source.index('// ============================================================================\n//  SEPT GIGS — interface',start)
    core=source[start:end]
    output=pathlib.Path(args.out);output.mkdir(parents=True,exist_ok=True)
    (output/'engine.js').write_text(core,encoding='utf-8')
    node=r'''
const fs=require('fs'),vm=require('vm'),{performance}=require('perf_hooks');
const core=fs.readFileSync(process.argv[1],'utf8');
const ctx={console,performance,Date,Math,setTimeout,clearTimeout,structuredClone};
ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
vm.runInContext(core+'\nglobalThis.ids=Object.keys(CARDS);',ctx);
process.stdout.write(JSON.stringify(ctx.ids));
'''
    cards=json.loads(subprocess.check_output(['node','-e',node,str(output/'engine.js')],text=True))
    if len(cards)!=150 or len(cards)!=len(set(cards)):raise ValueError("150 unique cards required")
    if source.count('const LOCAL_FR_ART = Object.freeze({});')!=1:
        raise ValueError('Missing canonical French artwork marker')
    art={cid:'images_vf/'+cid+'.webp' for cid in cards}
    final=source.replace('const LOCAL_FR_ART = Object.freeze({});',
      'const LOCAL_FR_ART = Object.freeze('+json.dumps(art,ensure_ascii=False,separators=(',',':'))+');')
    (output/'index.html').write_text(final,encoding='utf-8')
    handler="""self.onmessage=async function(event){
      const d=event.data||{};if(!Number.isInteger(d.id))return;
      try{
        self.AIChampion=()=>d.weights||null;
        self.AIPlanChampion=()=>d.plans||self.DeckPlanAI?.INITIAL;
        self.RivalLearningSession=()=>d.session||null;
        self.RivalLearningData=()=>d.memory||null;
        const g=new Game(d.state,[FastPolicy,FastPolicy],{thinking:()=>{}});
        const policy=makeAI(d.level||'expert');
        const action=d.method==='react'
          ?await policy.react(g,d.side,d.attack,d.actions)
          :await policy.mainAction(g,d.side,d.actions);
        self.postMessage({id:d.id,action});
      }catch(err){self.postMessage({id:d.id,error:String(err?.stack||err)})}
    };self.postMessage({ready:true});
    """
    (output/'ai-worker.js').write_text('self.window=self;\n\n'+core+'\n'+handler,encoding='utf-8')
    (output/'inline.js').write_text(final.split('<script>',1)[1].split('</script>',1)[0],encoding='utf-8')
    if 'TacticalWorker' not in final or len(final)<400000 or len(handler)<100:
        raise ValueError("Unexpected game runtime")
    for file in ['engine.js','ai-worker.js','inline.js']:
        subprocess.run(['node','--check',str(output/file)],check=True)
    filename='prime-content-v'+args.version+'.zip'
    zpath=output/filename
    with zipfile.ZipFile(zpath,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name in ['index.html','ai-worker.js']:
            archive.write(output/name,name)
    with zipfile.ZipFile(zpath) as archive:
        assert set(archive.namelist())=={'index.html','ai-worker.js'}
        assert archive.testzip() is None
    if zpath.stat().st_size>8*1024*1024:raise ValueError("Payload too large")
    sha=hashlib.sha256(zpath.read_bytes()).hexdigest()
    manifest={
      'schema':1,'version_code':args.version_code,'version':args.version,'min_shell':25000,
      'url':'https://github.com/yuri85300-design/lifequest/releases/download/'+
            'prime-content-v'+args.version+'/'+filename,
      'sha256':sha,'notes':'Mise a jour du jeu uniquement, sauvegardes et images VF conservees.'
    }
    (output/'latest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps({'version':args.version,'cards_fr_local':len(cards),'sha256':sha,
       'bundle_size':zpath.stat().st_size},indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',default='native/prime_v251_runtime.html')
    parser.add_argument('--version',default='2.5.1')
    parser.add_argument('--version-code',type=int,default=25001)
    parser.add_argument('--out',default='/tmp/prime-ota')
    build(parser.parse_args())
