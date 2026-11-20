#!/usr/bin/env python3
"""Construit les assets FR hors ligne à partir des impressions officielles Netdeck.
Ne publie aucune image dans le dépôt Git. Aucune substitution EN silencieuse.
Usage: python native/offline_fr_bundle.py --ids /tmp/cards.json --out /tmp/images_vf --report /tmp/report.json
"""
import argparse, concurrent.futures, hashlib, json, os, pathlib, re, sys, time, urllib.request, urllib.error
from urllib.parse import quote
API="https://api.netdeck.gg/api/cards/cyberpunk"
SLUG_MAP={"judy-alvarez-braindance-maestro":"judy-a-lvarez-braindance-maestro","judy-alvarez-nothing-to-doubt":"judy-a-lvarez-nothing-to-doubt"}
HDR={"User-Agent":"7GigsOfflineFrenchArtwork/1.0","Accept":"application/json,image/webp,image/png,image/jpeg,*/*"}
def fetch(url, limit=14000000):
    last=None
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers=HDR)
            with urllib.request.urlopen(req,timeout=24) as r:
                body=r.read(limit+1)
                if len(body)>limit: raise ValueError("file too large")
                return body
        except Exception as e:
            last=e;time.sleep(.5+attempt*1.3)
    raise last
def number(s): return re.sub(r'^0+','',str(s or '').lower()) or '0'
def is_fr(p):
    if not isinstance(p,dict):return False
    language=str(p.get("language") or p.get("locale") or p.get("lang") or '').lower()
    if language in ("fr","fr-fr","french","français"):return True
    st=p.get("set") or {}
    desc=(st if isinstance(st,str) else str(st.get("name",""))+' '+str(st.get("code",""))).lower()
    return bool(re.search(r'(?<![a-z])french(?![a-z])|(?<![a-z])fr(?![a-z])',desc))
def choose(d):
    printings=[p for p in (d.get("printings") or []) if isinstance(p,dict)]
    if d.get("language")=="fr": printings.append(d)
    matches=[p for p in printings if is_fr(p) and (p.get("image_url") or p.get("source_image_url"))]
    want=number(d.get("print_number") or d.get("collector_number"))
    def rank(p):
        st=p.get("set") or {}
        txt=(st if isinstance(st,str) else json.dumps(st,ensure_ascii=False)).lower()
        return (140 if number(p.get("collector_number") or p.get("print_number") or p.get("number"))==want else 0)+(20 if "retail" in txt or "welcome" in txt else 0)+(5 if p.get("image_url") else 0)
    matches.sort(key=rank,reverse=True)
    return matches[0] if matches else None
def scan(id, out):
    slug=SLUG_MAP.get(id,id)
    row={"id":id,"slug":slug,"language":"not_found","status":"unavailable"}
    try:
        raw=fetch(API+"/"+quote(slug),5000000)
        body=json.loads(raw.decode("utf-8"))
        d=body.get("item") or body.get("data") or (body.get("items") or [None])[0] if isinstance(body,dict) else None
        if not isinstance(d,dict): d=body
        if not isinstance(d,dict):raise ValueError("API returned invalid card record")
        p=choose(d)
        if p is None:row["status"]="no_french_print";return row
        row["language"]="fr"
        row["print_number"]=str(p.get("collector_number") or p.get("print_number") or "")
        row["localized_name"]=str(p.get("localized_name") or d.get("display_name") or "")
        row["printing_id"]=str(p.get("id") or p.get("printing_id") or "")
        url=p.get("image_url") or p.get("source_image_url")
        urls=[url]
        if p.get("source_image_url") and p.get("source_image_url")!=url:urls.append(p["source_image_url"])
        errors=[]
        for u in urls:
            if not u or not str(u).startswith("https://"):continue
            try:
                data=fetch(u)
                if data.startswith(b"RIFF") and data[8:12]==b"WEBP":
                    ext="webp"
                elif data.startswith(b"\\x89PNG"):
                    ext="png"
                elif data.startswith(b"\\xff\\xd8\\xff"):
                    ext="jpg"
                else:
                    raise ValueError("not a recognized image")
                if len(data)<2000:raise ValueError("image suspiciously small")
                target=pathlib.Path(out)/(id+"."+ext);target.write_bytes(data)
                row.update({"status":"downloaded_fr","size_bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),"path":"images_vf/"+target.name})
                return row
            except Exception as e:errors.append(str(e)[:160])
        row["status"]="image_download_failed";row["error"]=" | ".join(errors)
        return row
    except Exception as e:
        row["status"]="metadata_unavailable";row["error"]=str(e)[:200]
        return row
def main():
    p=argparse.ArgumentParser();p.add_argument("--ids",required=True);p.add_argument("--out",required=True);p.add_argument("--report",required=True);p.add_argument("--strict",action="store_true"); args=p.parse_args()
    ids=json.loads(pathlib.Path(args.ids).read_text(encoding="utf-8"))
    assert len(ids)==150 and len(set(ids))==150,"expected exactly 150 unique game card IDs"
    pathlib.Path(args.out).mkdir(parents=True,exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        rows=sorted(ex.map(lambda id:scan(id,args.out),ids),key=lambda x:x["id"])
    ready=[r for r in rows if r["status"]=="downloaded_fr"]
    report={"catalogue":len(ids),"french_images_ready":len(ready),"no_french_images":len(ids)-len(ready),
            "total_bytes":sum(r["size_bytes"] for r in ready),"results":rows}
    pathlib.Path(args.report).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print("COVERAGE "+str(len(ready))+"/"+str(len(ids))+" "+str(report["total_bytes"])+" bytes")
    for r in rows:
        if r["status"]!="downloaded_fr":print("MISSING "+r["id"]+" "+r["status"]+" "+r.get("error",""))
    if args.strict and len(ready)!=len(ids):return 2
    return 0
if __name__=="__main__":sys.exit(main())
