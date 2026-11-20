#!/usr/bin/env python3
"""Offline race-condition tests for monotonic manifest publishing."""
import base64
import importlib.util
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('ota',str(Path(__file__).with_name('ota_manifest_guard.py')))
ota=importlib.util.module_from_spec(spec)
spec.loader.exec_module(ota)
class Response:
    def __init__(self,returncode=0,stdout='',stderr=''):
        self.returncode=returncode;self.stdout=stdout;self.stderr=stderr
def current(code):
    raw={'version_code':code,'version':str(code)}
    return Response(stdout=json.dumps({'sha':'current-blob',
        'content':base64.b64encode(json.dumps(raw).encode()).decode()}))
with tempfile.TemporaryDirectory() as directory:
    path=Path(directory)/'latest.json'
    path.write_text(json.dumps({'schema':1,'version':'2.7.0','version_code':27000,'min_shell':25004,
      'sha256':'a'*64,'url':'https://github.com/yuri85300-design/lifequest/releases/download/prime-content-v2.7.0/prime-content-v2.7.0.zip'}))
    counts={'updates':0,'get':0}
    def skip(*args,**kw):
        assert '-X' not in args
        counts['get']+=1;return current(27001)
    with patch.object(ota,'gh',skip):
        assert ota.publish(path)==0
    assert counts['get']==1 and counts['updates']==0
    def advance(*args,**kw):
        if '-X' not in args:return current(26002)
        counts['updates']+=1;return Response(stdout='{"commit":{}}')
    with patch.object(ota,'gh',advance):
        assert ota.publish(path)==0
    assert counts['updates']==1
    serial=[current(26002),Response(returncode=1,stderr='409 Conflict'),current(27002)]
    def concurrent(*args,**kw):
        return serial.pop(0)
    with patch.object(ota,'gh',concurrent),patch.object(ota.time,'sleep',lambda _:None):
        assert ota.publish(path)==0
    assert not serial
print(json.dumps({'manifestNoDowngrade':'PASS','manifestAdvance':'PASS','manifestRace':'PASS'}))
