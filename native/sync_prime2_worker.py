#!/usr/bin/env python3
"""Keep the Android WebView game and its NIGHTMARE Worker on identical rules."""
from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('app/src/main/assets/www')
html=(root/'index.html').read_text(encoding='utf8')
script=html.split('<script>',1)[1].split('</script>',1)[0]
marker='//  SEPT GIGS — interface'
cut=script.rfind('// ============================================================================',0,script.index(marker))
if cut<100000 or 'async stealGigs(' not in script[:cut]:
    raise ValueError('Rules engine missing; Worker not generated')
current=(root/'ai-worker.js').read_text(encoding='utf8')
tail=current[current.index('self.onmessage=async function'):]
worker='self.window=self;\n'+script[:cut]+'\n'+tail
(root/'ai-worker.js').write_text(worker,encoding='utf8')
print('Synchronized Worker with corrected PRIME rules:',len(worker))
