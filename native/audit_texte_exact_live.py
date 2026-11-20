#!/usr/bin/env python3
"""Comparer sans normalisation les textes anglais réellement publiés par cyberpunktcg.com.

Une validation LIVE requiert 150 réponses HTML directes, 150 réponses trouvées dans
l'API vivante et aucune divergence de contenu non expliquée. L'archive utilisée
comme référence est explicitement HISTORIQUE : ne vaut pas une preuve en direct.

Dépendances: python -m pip install requests beautifulsoup4
Exemple:
  python audit_texte_exact_live.py --game prime219_cartes_reelles.json --out ./resultats

Sortie: rapport.json, fiches.csv, differences.csv, captures_html/*.html,
        snapshots_api/*.json. Exit 0 = source live disponible et aucun changement
        depuis la référence; 2 = divergence / source manquante / hors périmètre.
"""
from __future__ import annotations
import argparse, concurrent.futures, csv, datetime as dt, difflib, hashlib
import json, os, re, sys, time, unicodedata
from pathlib import Path
from urllib.parse import quote, urlparse
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

API = 'https://api.netdeck.gg/api/cards/cyberpunk'
REFERENCE = 'https://raw.githubusercontent.com/ttiiggss/night-city-archive/main/data/cards.json'
SITE = 'https://cyberpunktcg.com/cards/'
LABEL = re.compile(r'OFFICIAL\s+CURRENT\s+RULES\s+TEXT', re.I)
END = re.compile(r'^(?:SET\s*:|RARITY\s*:|NUMBER\s*:|ILLUSTRATED\s+BY\s*:|STAY IN THE LOOP)',re.I)
DEFAULT_HEADERS = {
    'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    'Accept':'text/html,application/json;q=0.9,*/*;q=0.5',
    'Referer':'https://cyberpunktcg.com/cards',
}

def idkey(s):
    x=unicodedata.normalize('NFKD',str(s or '').lower())
    return re.sub('[^a-z0-9]','', ''.join(c for c in x if not unicodedata.combining(c))).replace('0','o')

def session():
    s=requests.Session();s.headers.update(DEFAULT_HEADERS)
    retry=Retry(total=2,backoff_factor=.45,status_forcelist=(429,500,502,503,504),respect_retry_after_header=True)
    s.mount('https://',HTTPAdapter(max_retries=retry,pool_connections=8,pool_maxsize=8))
    return s

def fetch_json(s,url,timeout=20):
    r=s.get(url,timeout=timeout,headers={'Accept':'application/json','Origin':'https://cyberpunktcg.com'})
    r.raise_for_status();return r.json()

def official_live(s):
    start=fetch_json(s,API+'?limit=100&offset=0')
    if not isinstance(start,dict) or not isinstance(start.get('total'),int) or not isinstance(start.get('items'),list):
        raise ValueError('API officielle: pagination ou schéma inattendu')
    cards=list(start['items']); total=start['total']
    if total<150 or len(cards)==0:raise ValueError(f'Catalogue incomplet: {total} entrées')
    while len(cards)<total:
        batch=fetch_json(s, API+f'?limit=100&offset={len(cards)}')
        if not batch.get('items'): raise ValueError('Pagination interrompue')
        cards.extend(batch['items'])
    if len(cards)!=total: raise ValueError(f'API: {len(cards)} sur {total}')
    return cards

def extract_publisher_text(html):
    """Lire le bloc de texte original de la page SSR, caractère par caractère.

    Ne jamais utiliser soup.get_text('\\n') sur toute la page : ce séparateur
    introduit des caractères entre nœuds inline et transforme {Spend}: en
    {Spend} \\n : de façon artificielle. Le bloc whitespace-pre-wrap contient
    le texte exact, et get_text('', strip=False) préserve ses caractères.
    """
    soup=BeautifulSoup(html,'html.parser')
    labels=[x for x in soup.find_all(string=LABEL) if 'ENGLISH' in str(x).upper()]
    if len(labels)!=1:return None,f'HEADER_COUNT_{len(labels)}'
    title=labels[0].parent
    region=title.find_next_sibling('div')
    if region is None or 'whitespace-pre-wrap' not in (region.get('class') or []):
        return None,'OFFICIAL_RULES_REGION_NOT_FOUND'
    if region.find(['script','style','noscript']):
        return None,'UNEXPECTED_NESTED_CODE'
    text=region.get_text(separator='',strip=False)
    if len(text)>8000:return None,'RULES_REGION_UNEXPECTED_LENGTH'
    return text,'OK'

def sha(s):return hashlib.sha256(s.encode('utf-8')).hexdigest()

def first_diff(a,b):
    i=0
    while i<min(len(a),len(b)) and a[i]==b[i]:i+=1
    ca=ord(a[i]) if i<len(a) else None
    cb=ord(b[i]) if i<len(b) else None
    return {'index_codepoint':i,'reference_character':a[i:i+1],
            'published_character':b[i:i+1],
            'reference_Uplus':f'U+{ca:04X}' if ca is not None else 'EOF',
            'published_Uplus':f'U+{cb:04X}' if cb is not None else 'EOF',
            'reference_context':a[max(0,i-35):i+65],
            'published_context':b[max(0,i-35):i+65],
            'reference_codepoints':len(a),'published_codepoints':len(b),
            'reference_sha256':sha(a),'published_sha256':sha(b)}

def squish_ws(s):return ' '.join(s.split())

def compare(a,b):
    if a==b: return 'EXACT_CODEPOINTS',None
    if squish_ws(a)==squish_ws(b):return 'LAYOUT_DIFFERENCE_NOT_EXACT',first_diff(a,b)
    return 'CONTENT_DIFFERENCE',first_diff(a,b)

def write_csv(path,rows,fields):
    with open(path,'w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fields,delimiter=';',extrasaction='ignore');w.writeheader();w.writerows(rows)

def read_game(path):
    obj=json.loads(Path(path).read_text(encoding='utf8'))
    cards=obj['cards'] if isinstance(obj,dict) and isinstance(obj.get('cards'),list) else obj
    if not isinstance(cards,list) or len(cards)!=150 or len({idkey(c['id']) for c in cards})!=150:
        raise ValueError('Le fichier PRIME doit contenir 150 cartes uniques')
    return cards

def discover_registry_urls(path):
    if not path:return {}
    result={}
    with open(path,encoding='utf-8-sig',newline='') as f:
        rows=csv.DictReader(f,delimiter=';')
        for r in rows:
            url=r.get('official_page_URL_actually_read') or r.get('publisher_original_url')
            if url and url.startswith(SITE):result[idkey(r['id'])]=url
    return result

def fetch_html(card,urls,api_off):
    cid=card['id'];slug=api_off['slug']
    s=session()
    choices=[]
    for url in [SITE+quote(slug,safe='-'),urls.get(idkey(cid)),SITE+quote(cid,safe='-')]:
        if url and url not in choices and url.startswith(SITE):choices.append(url)
    attempts=[]
    for url in choices:
        try:
            response=s.get(url,timeout=18,headers={'Accept':'text/html'})
            response.raise_for_status()
            if 'html' not in response.headers.get('Content-Type','').lower():
                attempts.append(f'{url}: non-HTML');continue
            # Les pages declarent UTF-8 en HTML. Requests peut pourtant
            # deviner Latin-1 si Content-Type n'indique pas charset ; decoder
            # les OCTETS source explicitement, sans corruption silencieuse.
            html=response.content.decode('utf-8',errors='strict')
            visible,reason=extract_publisher_text(html)
            if reason!='OK':attempts.append(f'{url}: {reason}');continue
            return {'url':url,'visible':visible,'html':html,'reason':'OK','attempts':attempts}
        except Exception as e:attempts.append(f'{url}: {type(e).__name__}: {str(e)[:160]}')
    return {'url':choices[0] if choices else None,'visible':None,'html':None,'reason':'FETCH_OR_EXTRACTION_FAILED','attempts':attempts}

def main(argv=None):
    ap=argparse.ArgumentParser(description='Audit strict live: 150 cartes PRIME vs API éditeur + pages éditeur')
    ap.add_argument('--game',default='prime219_cartes_reelles.json')
    ap.add_argument('--reference',help='Snapshot JSON téléchargé lors du précédent audit (historique; pas live)')
    ap.add_argument('--registry',help='Registre des URL consultées précédemment')
    ap.add_argument('--out',default='comparaison_live_resultats')
    ap.add_argument('--workers',type=int,default=5)
    ap.add_argument('--timeout',type=int,default=20)
    args=ap.parse_args(argv)
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    report={'created_utc':dt.datetime.now(dt.timezone.utc).isoformat(), 'mode':'STRICT_OFFICIAL_LIVE',
            'game':args.game,'api':API,'baseline':args.reference or REFERENCE,
            'official_page':SITE,'certification':False,'cards_expected':150,
            'errors':[],'summary':{},'reference_150_exact':False,'notes':[
              'Comparaison littérale Unicode sans suppression des parenthèses, symboles ni texte de rappel.',
              'Les pages déclarent UTF-8 et le bloc SSR de règles est comparé au JSON sans ajout artificiel de séparateurs.',
              'Une archive ne peut jamais certifier le contenu actuellement publié.']}
    game=read_game(args.game)
    try:
        s=session()
        # Vérifier d'abord le canal direct éditeur, pour isoler sans ambiguïté le blocage réseau.
        live=official_live(s)
        ref=json.loads(Path(args.reference).read_text(encoding='utf-8')) if args.reference else fetch_json(s,REFERENCE)
        old=ref['cards'] if isinstance(ref,dict) else ref
        report['publisher_total']=len(live)
        baseline_by={idkey(x['slug']):x for x in old if x.get('slug')}
        live_by={idkey(x['slug']):x for x in live if x.get('slug')}
        if len(live_by)!=len(live):report['errors'].append('Collision de slugs ou champ absent dans API live')
        urls=discover_registry_urls(args.registry)
        rows=[];differences=[]
        captures=out/'captures_html';captures.mkdir(exist_ok=True)
        pdir=out/'snapshots_api';pdir.mkdir(exist_ok=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(8,args.workers))) as executor:
            tasks={}
            for c in game:
                official=live_by.get(idkey(c['id']))
                if official:tasks[executor.submit(fetch_html,c,urls,official)]=c['id']
            fetched={tasks[f]:f.result() for f in concurrent.futures.as_completed(tasks)}
        for c in game:
            cid=c['id'];off=live_by.get(idkey(cid));historic=baseline_by.get(idkey(cid))
            row={'card_id':cid,'url':None,'api_live_found':bool(off),
                 'archive_found':bool(historic),'api_raw_status':'UNAVAILABLE',
                 'page_status':'UNAVAILABLE','page_to_api_status':'UNAVAILABLE',
                 'api_to_archive_status':'UNAVAILABLE','other_differences':'',
                 'error':''}
            if not off:
                row['error']='ABSENT_FROM_LIVE_API';report['errors'].append(cid+': absent de API live')
                rows.append(row);continue
            page=fetched.get(cid,{})
            row['url']=page.get('url')
            live_text=off.get('rules_text')
            if not isinstance(live_text,str):
                row['error']='OFFICIAL_RULES_TEXT_NOT_STRING';report['errors'].append(cid+': texte API absent')
                rows.append(row);continue
            (pdir/(cid+'.json')).write_text(json.dumps({'id':off.get('id'),'slug':off.get('slug'),
                'rules_text':live_text,'name':off.get('display_name'),'cost':off.get('cost'),
                'power':off.get('power'),'ram':off.get('ram'),'type':off.get('card_type'),
                'tags':off.get('classifications'),'keywords':off.get('keywords')},
                ensure_ascii=False,indent=2),encoding='utf-8')
            row['api_raw_sha256']=sha(live_text)
            # Contrôle des caractéristiques PRIME vs backend en direct (indépendant du snapshot).
            live_metadata_mismatches=[]
            for gfield, offield in [('type','card_type'),('color','color'),('cost','cost'),
                                   ('ram','ram'),('power','power'),('sell','is_eddiable')]:
                gval=c.get(gfield);oval=off.get(offield)
                if gval!=oval:live_metadata_mismatches.append(f'{gfield}: {gval!r} != {oval!r}')
            own_tags=sorted(idkey(t) for t in c.get('tags',[]))
            pub_tags=sorted(idkey(t) for t in off.get('classifications',[]))
            if own_tags!=pub_tags:live_metadata_mismatches.append(f'tags: {own_tags!r} != {pub_tags!r}')
            if live_metadata_mismatches:
                row['other_differences']+='GAME_VS_LIVE: '+'; '.join(live_metadata_mismatches)
                report['errors'].append(cid+': caractéristiques PRIME divergentes du site')
            if historic:
                old_text=historic.get('rules_text')
                if isinstance(old_text,str):
                    status,detail=compare(old_text,live_text)
                    row['api_to_archive_status']=status
                    if detail:differences.append({'card_id':cid,'source':'HISTORIC_TO_LIVE_API','status':status,**detail})
                else:row['error']='HISTORICAL_RULES_TEXT_NOT_STRING'
                for k,gkey in [('type','card_type'),('color','color'),('cost','cost'),('ram','ram'),
                                ('power','power'),('tags','classifications'),('keywords','keywords'),('sell','is_eddiable')]:
                    v=historic.get(gkey);nv=off.get(gkey)
                    if v!=nv:
                        row['other_differences']+=f'{k}: {v!r} -> {nv!r}; '
            else:
                row['error']='NO_HISTORICAL_BASELINE';report['errors'].append(cid+': archive absente')
            vis=page.get('visible')
            if vis is None:
                row['error']+='|'+page.get('reason','UNKNOWN_PAGE_ERROR')
                report['errors'].append(cid+': page illisible: '+str(page.get('attempts',[]))[:400])
            else:
                (captures/(cid+'.html')).write_text(page['html'],encoding='utf-8')
                status,detail=compare(live_text,vis)
                row['page_to_api_status']=status
                row['page_status']='FETCHED_TEXT_EXTRACTED'
                row['page_sha256']=sha(vis)
                if detail:differences.append({'card_id':cid,'source':'LIVE_API_TO_LIVE_RENDERED_PAGE','status':status,**detail})
                # La page doit refléter le JSON au moins après uniformisation DES ESPACES UNIQUEMENT.
                if status=='CONTENT_DIFFERENCE':
                    report['errors'].append(cid+': page actuelle diffère du texte de son API, hors seuls espaces')
            rows.append(row)
        extras=[{'slug':x.get('slug'),'name':x.get('display_name'),'rules_text':x.get('rules_text')}
                for x in live if idkey(x.get('slug')) not in {idkey(c['id']) for c in game}]
        report['additional_cards']=extras
        if extras: report['errors'].append(f'{len(extras)} fiches hors périmètre PRIME: légalité compétitive à examiner')
        fields=['card_id','url','api_live_found','archive_found','api_to_archive_status',
                'page_status','page_to_api_status','api_raw_sha256','page_sha256','other_differences','error']
        write_csv(out/'fiches_comparaison.csv',rows,fields)
        write_csv(out/'differences_caractere.csv',differences,
                  ['card_id','source','status','index_codepoint','reference_character','published_character',
                   'reference_Uplus','published_Uplus','reference_context','published_context',
                   'reference_codepoints','published_codepoints','reference_sha256','published_sha256'])
        report['summary']={'cards':len(rows),'live_api_found':sum(r['api_live_found'] for r in rows),
            'html_pages_extracted':sum(r['page_status']=='FETCHED_TEXT_EXTRACTED' for r in rows),
            'historical_to_live_exact':sum(r['api_to_archive_status']=='EXACT_CODEPOINTS' for r in rows),
            'page_vs_api_exact':sum(r['page_to_api_status']=='EXACT_CODEPOINTS' for r in rows),
            'page_vs_api_layout_only':sum(r['page_to_api_status']=='LAYOUT_DIFFERENCE_NOT_EXACT' for r in rows),
            'text_changes_vs_archive':sum(r['api_to_archive_status'] not in ('EXACT_CODEPOINTS','UNAVAILABLE') for r in rows),
            'characters_diff_records':len(differences),'extras':len(extras)}
        report['reference_150_exact']=bool(len(rows)==150 and
           all(r['api_live_found'] and r['page_status']=='FETCHED_TEXT_EXTRACTED' for r in rows) and
           all(r['api_to_archive_status']=='EXACT_CODEPOINTS' for r in rows) and
           all(r['page_to_api_status']=='EXACT_CODEPOINTS' for r in rows) and
           not any(r['other_differences'] or r['error'] for r in rows))
        # Une certification complète incluant toutes les nouvelles cartes est
        # distincte du certificat du périmètre historique des 150.
        report['certification']=bool(report['reference_150_exact'] and not report['errors'])
    except Exception as ex:
        report['errors'].append(type(ex).__name__+': '+str(ex))
        report['certification']=False
        report['source_availability']='UNAVAILABLE'
    (out/'rapport.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'certification':report['certification'],'summary':report['summary'],
                      'errors':report['errors'][:3]},ensure_ascii=False,indent=2))
    return 0 if report['certification'] else 2
if __name__=='__main__':sys.exit(main())