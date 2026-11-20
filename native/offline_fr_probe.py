#!/usr/bin/env python3
"""Diagnostic non destructif : disponibilité des visuels Cyberpunk TCG en français."""
import json,urllib.request,urllib.error,time,sys
ROOT="https://api.netdeck.gg/api/cards/cyberpunk"
HEAD={"User-Agent":"7Gigs-PRIME-Offline-Asset-Audit/1.0","Accept":"application/json"}
SLUGS=["v-streetkid","kiroshi-optics","gorilla-arms","judy-a-lvarez-braindance-maestro","zetatech-berserk","animals-wrecker","viktor-vektor-drop-your-illusions"]
def get(url):
  req=urllib.request.Request(url,headers=HEAD)
  with urllib.request.urlopen(req,timeout=22) as r:
    raw=r.read(10000000);return json.loads(raw),r.status
def summary(p):
  if not isinstance(p,dict):return str(type(p))
  return {k:(v if isinstance(v,(int,float,bool,str)) and len(str(v))<230 else {"type":type(v).__name__,"length":len(v)} if isinstance(v,(dict,list)) else str(v)[:160]) for k,v in p.items() if any(term in k.lower() for term in ["set","print","lang","locale","image","source","name","number","slug"])}
for slug in SLUGS:
 try:
  body,status=get(ROOT+"/"+slug)
  d=body.get("item") or body.get("data") or (body.get("items") or [None])[0] if isinstance(body,dict) else None
  if not isinstance(d,dict): d=body
  candidates=list(d.get("printings") or [])+[d] if isinstance(d,dict) else []
  french=[summary(p) for p in candidates if isinstance(p,dict) and any(x in str([p.get("set"),p.get("language"),p.get("locale"),p.get("lang")]).lower() for x in ("french","français","'fr'","-fr","_fr"))]
  print(json.dumps({"slug":slug,"status":status,"rootKeys":list(body.keys())[:16] if isinstance(body,dict) else [],"card":summary(d),"printings":len(candidates),"fr":french[:6]},ensure_ascii=False))
 except Exception as e:
  print(json.dumps({"slug":slug,"error":repr(e)}))
