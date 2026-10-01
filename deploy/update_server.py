"""Update only the installed NEXUS service from a pinned public Git commit."""
import argparse
import json
import os
import py_compile
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPOSITORY='CaptainReinor/nexus'
MODULES=('nexus_backup.py','accounts.py')

def healthy():
    for _ in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:18743/health',timeout=2) as response:
                body=json.load(response)
                if response.status==200 and body.get('status') == 'ok':
                    return True
        except (OSError,ValueError):
            pass
        time.sleep(0.5)
    return False

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--commit',required=True,help='Full 40-character Git commit SHA reviewed for deployment')
    parser.add_argument('--app-dir',type=Path,default=Path('/opt/nexus-backup'))
    args=parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}',args.commit):parser.error('--commit must be a full Git commit SHA')
    if os.geteuid()!=0:parser.error('Run as root')
    target=args.app_dir.resolve()
    if target!=Path('/opt/nexus-backup'):parser.error('Only the existing /opt/nexus-backup installation is supported')
    if not (target/'nexus_backup.py').is_file() or not Path('/etc/nexus-backup.env').is_file():
        parser.error('Existing NEXUS installation is missing; use install_vps.py first')
    update(target,args.commit)

def update(target:Path,commit:str):
    with tempfile.TemporaryDirectory(prefix='nexus-code-update-') as temp:
        stage=Path(temp)
        for name in MODULES:
            url=f'https://raw.githubusercontent.com/{REPOSITORY}/{commit}/{name}'
            with urllib.request.urlopen(url,timeout=30) as response:
                code=response.read(1_000_001)
            if len(code)>1_000_000:raise RuntimeError('Unexpected source size')
            (stage/name).write_bytes(code)
            py_compile.compile(str(stage/name),doraise=True)
        subprocess.run(['/usr/bin/python3','-B','-c','import nexus_backup, accounts'],cwd=stage,check=True)
        stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        backup=target/'code-backups'/stamp
        backup.mkdir(parents=True,mode=0o700)
        previous={name:(target/name).is_file() for name in MODULES}
        for name,exists in previous.items():
            if exists:shutil.copy2(target/name,backup/name)
        try:
            for name in MODULES:
                temporary=target/(name+'.new')
                shutil.copyfile(stage/name,temporary);os.chmod(temporary,0o644);os.replace(temporary,target/name)
            subprocess.run(['systemctl','restart','nexus-backup.service'],check=True)
            if not healthy():raise RuntimeError('Updated NEXUS health check failed')
        except BaseException:
            for name,exists in previous.items():
                if exists:shutil.copy2(backup/name,target/name)
                else:(target/name).unlink(missing_ok=True)
            subprocess.run(['systemctl','restart','nexus-backup.service'],check=True)
            restored=healthy()
            raise RuntimeError(f'Update failed; old source restored. Previous service healthy: {restored}') from None
    print(f'NEXUS code updated to {commit}; previous code: {backup}')

if __name__=='__main__':main()
