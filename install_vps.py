"""Install the NEXUS backup API beside the existing VPS sites.

Run as root on the specific VDSina VPS after reviewing this file. Existing site
configuration is saved before modification and nginx is tested before reload.
"""

import os
import secrets
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path


HOST = "v3233631.hosted-by-vdsina.ru"
SITE = Path("/etc/nginx/sites-available/vladimir-resume")
APP_DIR = Path("/opt/nexus-backup")
UNIT = Path("/etc/systemd/system/nexus-backup.service")
ENV = Path("/etc/nexus-backup.env")
LOCATION = """\n    location ^~ /nexus-api/ {
        client_max_body_size 30m;
        proxy_pass http://127.0.0.1:18743/;
        proxy_set_header Host $host;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 35s;
    }
"""
UNIT_TEXT = """[Unit]
Description=NEXUS encrypted backup API
After=network.target

[Service]
Type=simple
DynamicUser=yes
StateDirectory=nexus-backup
StateDirectoryMode=0700
WorkingDirectory=/opt/nexus-backup
EnvironmentFile=/etc/nexus-backup.env
ExecStart=/usr/bin/python3 -B /opt/nexus-backup/nexus_backup.py
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes

[Install]
WantedBy=multi-user.target
"""


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit("Run as root")
    source = Path(__file__).with_name("nexus_backup.py")
    if not source.is_file() or not SITE.is_file():
        raise SystemExit("NEXUS source or expected nginx site is missing")
    site_text = SITE.read_text("utf-8")
    marker = f"server_name {HOST};"
    if site_text.count(marker) != 2:
        raise SystemExit("The nginx site has changed; inspect it before installation")
    if "/nexus-api/" in site_text and LOCATION not in site_text:
        raise SystemExit("Another nexus-api route exists; inspect it before installation")

    APP_DIR.mkdir(mode=0o755, parents=True, exist_ok=True)
    os.chmod(APP_DIR, 0o755)
    shutil.copy2(source, APP_DIR / "nexus_backup.py")
    os.chmod(APP_DIR / "nexus_backup.py", 0o644)
    if not ENV.exists():
        token = secrets.token_urlsafe(48)
        fd = os.open(ENV, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            output.write(f"NEXUS_BACKUP_TOKEN={token}\nNEXUS_BACKUP_DIR=/var/lib/nexus-backup\n")
    UNIT.write_text(UNIT_TEXT, "utf-8")
    os.chmod(UNIT, 0o644)
    run("systemctl", "daemon-reload")
    run("systemctl", "enable", "--now", "nexus-backup.service")
    run("systemctl", "restart", "nexus-backup.service")
    run("curl", "--fail", "--silent", "--show-error", "--noproxy", "*", "http://127.0.0.1:18743/health")

    if LOCATION not in site_text:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = SITE.with_name(f"{SITE.name}.before-nexus-{stamp}")
        shutil.copy2(SITE, backup)
        try:
            SITE.write_text(site_text.replace(marker, marker + LOCATION, 1), "utf-8")
            run("nginx", "-t")
            run("systemctl", "reload", "nginx")
            run("curl", "--fail", "--silent", "--show-error", "--noproxy", "*", "--resolve", f"{HOST}:443:127.0.0.1", f"https://{HOST}/nexus-api/health")
        except BaseException:
            shutil.copy2(backup, SITE)
            run("nginx", "-t")
            run("systemctl", "reload", "nginx")
            raise
    print("NEXUS backup API is running over HTTPS; the access token is in /etc/nexus-backup.env")


if __name__ == "__main__":
    main()

