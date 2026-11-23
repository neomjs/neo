"""Verify reviewed cover bytes at the public Pages site and the URL used by the gallery."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from urllib.parse import quote

root=Path(__file__).parent
manifest=Path(sys.argv[1]) if len(sys.argv)>1 else root/"media-manifest.json"
expected=json.loads(manifest.read_bytes())
hosts={"site":"https://neomjs.com/","gallery":"https://raw.githubusercontent.com/neomjs/pages/main/"}
def check(pair):
    row,host=pair
    r=subprocess.run(["curl","-sSL","--retry","1","--connect-timeout","7","--max-time","20",
                      "--write-out","\n%{http_code}",hosts[host]+quote(row["path"])],capture_output=True,timeout=50)
    data,_,status=r.stdout.rpartition(b"\n")
    digest=hashlib.sha256(data).hexdigest() if status==b"200" else None
    return {"id":row["id"],"pagesPR":row["pr"],"scheme":row["scheme"],"host":host,"path":row["path"],
            "http":status.decode(errors="replace"),"expected":row["sha256"],"observed":digest,
            "matches":r.returncode==0 and digest==row["sha256"],"curlExitCode":r.returncode}
start=datetime.now(timezone.utc)
with ThreadPoolExecutor(max_workers=4) as pool:
    results=list(pool.map(check,[(r,h) for r in expected for h in hosts]))
by_pr={}
for n in sorted({r["pr"] for r in expected}):
    by_pr[n]={h:{"matched":sum(r["matches"] for r in results if r["pagesPR"]==n and r["host"]==h),
                 "total":sum(1 for r in results if r["pagesPR"]==n and r["host"]==h)} for h in hosts}
all_pass=all(r["matches"] for r in results)
receipt={"started":start.isoformat(),"checkedThrough":datetime.now(timezone.utc).isoformat(),"byPagesPR":by_pr,"allMatch":all_pass,"results":results}
out=Path(sys.argv[2]) if len(sys.argv)>2 else root/("public-media-"+start.strftime("%H%M%S")+".json")
out.write_text(json.dumps(receipt,indent=2)+"\n")
print(json.dumps({"byPagesPR":by_pr,"allMatch":all_pass,"receipt":str(out)}))
sys.exit(0 if all_pass else 1)
