"""Reproduce the two candidate trees without changing any source checkout or remote ref.

Run: python3 replay-trees.py ENGINE_CHECKOUT PAGES_CHECKOUT
Place review.json alongside this script. The checkouts must contain the pinned commits.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

def git(*args, env=None):
    return subprocess.check_output(["git",*map(str,args)],env=env,text=True).strip()

def rehearse(source,base,heads):
    original=Path(git("-C",source,"rev-parse","--path-format=absolute","--git-common-dir"))/"objects"
    with tempfile.TemporaryDirectory() as tmp:
        db=Path(tmp)/"objects.git"
        git("init","--bare","--quiet",db)
        (db/"objects/info/alternates").write_text(str(original)+"\n")
        # These commits only carry merge ancestry inside the temporary repository.
        env=dict(os.environ,GIT_AUTHOR_NAME="Release rehearsal",GIT_AUTHOR_EMAIL="rehearsal@localhost",
            GIT_COMMITTER_NAME="Release rehearsal",GIT_COMMITTER_EMAIL="rehearsal@localhost")
        current=base
        trees=[]
        for head in heads:
            tree=git("--git-dir",db,"merge-tree","--write-tree",current,head).splitlines()[0]
            trees.append(tree)
            current=git("--git-dir",db,"commit-tree",tree,"-p",current,"-p",head,"-m","Temporary candidate",env=env)
        return trees

def main():
    if len(sys.argv)!=3: raise SystemExit(__doc__)
    data=json.loads(Path(__file__).with_name("review.json").read_bytes())
    engine,pages=data["engine"],data["pages"]
    derived=rehearse(sys.argv[1],engine["base"],[x["head"] for x in engine["stages"]])
    assert derived==[x["tree"] for x in engine["stages"]]
    assert derived[-2:]==[engine["eight"],engine["nine"]]
    from itertools import permutations
    for order in permutations(pages["pulls"].values()):
        assert rehearse(sys.argv[2],pages["main"],order)[-1]==pages["resultTree"]
    print("Eight Engine PRs:",derived[-2])
    print("Nine Engine PRs, conditional on the desktop physical check:",derived[-1])
    print("Three Pages PRs in all six orders:",pages["resultTree"])

if __name__=="__main__":
    main()
