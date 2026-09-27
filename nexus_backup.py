"""Single-user encrypted-backup store for NEXUS. Bind only to loopback behind HTTPS nginx."""

import base64
import binascii
import hmac
import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


TOKEN = os.environ.get("NEXUS_BACKUP_TOKEN", "")
DATA_DIR = Path(os.environ.get("NEXUS_BACKUP_DIR", "/var/lib/nexus-backup"))
PORT = int(os.environ.get("NEXUS_BACKUP_PORT", "18743"))
MAX_BODY = 30_000_000
ID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def atomic_write(path: Path, content: bytes) -> None:
    with tempfile.NamedTemporaryFile(dir=DATA_DIR, prefix=".new-", delete=False) as temp:
        temp_path = Path(temp.name)
        os.chmod(temp_path, 0o600)
        try:
            temp.write(content)
            temp.flush()
            os.fsync(temp.fileno())
        except BaseException:
            temp_path.unlink(missing_ok=True)
            raise
    try:
        os.replace(temp_path, path)
    finally:
        temp_path.unlink(missing_ok=True)


def valid_envelope(value: object) -> bool:
    if not isinstance(value, dict) or set(value) != {"format", "version", "exportedAt", "salt", "iv", "tag", "ciphertext"}:
        return False
    if value["format"] != "nexus-encrypted-backup" or value["version"] != 1:
        return False
    if not isinstance(value["exportedAt"], str) or len(value["exportedAt"]) > 40:
        return False
    try:
        exported_at = datetime.fromisoformat(value["exportedAt"].replace("Z", "+00:00"))
        if exported_at.tzinfo is None:
            return False
        for name, length in (("salt", 16), ("iv", 12), ("tag", 16)):
            if not isinstance(value[name], str) or len(base64.b64decode(value[name], validate=True)) != length:
                return False
        if not isinstance(value["ciphertext"], str) or not 0 < len(value["ciphertext"]) <= 28_000_000:
            return False
        base64.b64decode(value["ciphertext"], validate=True)
    except (ValueError, TypeError, binascii.Error):
        return False
    return True


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def respond(self, status: int, payload: object) -> None:
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def authorized(self) -> bool:
        supplied = self.headers.get("Authorization", "")
        expected = "Bearer " + TOKEN
        if not TOKEN or not hmac.compare_digest(supplied, expected):
            self.respond(401, {"error": "unauthorized"})
            return False
        return True

    def do_GET(self) -> None:
        if self.path == "/health":
            self.respond(200, {"status": "ok"})
            return
        if not self.authorized():
            return
        if self.path == "/v1/backups":
            items = []
            for path in DATA_DIR.glob("*.meta"):
                try:
                    item = json.loads(path.read_text("utf-8"))
                    if ID_RE.fullmatch(item["id"]) and (DATA_DIR / (item["id"] + ".blob")).is_file():
                        items.append(item)
                except (OSError, ValueError, KeyError, TypeError):
                    continue
            items.sort(key=lambda item: item["createdAt"], reverse=True)
            self.respond(200, items[:500])
            return
        if self.path.startswith("/v1/backups/"):
            item_id = self.path.rsplit("/", 1)[-1]
            if not ID_RE.fullmatch(item_id):
                self.respond(404, {"error": "not_found"})
                return
            path = DATA_DIR / (item_id + ".blob")
            if not path.is_file():
                self.respond(404, {"error": "not_found"})
                return
            data = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(data)
            return
        self.respond(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if not self.authorized():
            return
        if self.path != "/v1/backups":
            self.respond(404, {"error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if not 0 < length <= MAX_BODY:
            self.respond(413, {"error": "invalid_size"})
            return
        body = self.rfile.read(length)
        try:
            envelope = json.loads(body)
        except (ValueError, UnicodeDecodeError):
            self.respond(400, {"error": "invalid_json"})
            return
        if not valid_envelope(envelope):
            self.respond(400, {"error": "invalid_envelope"})
            return
        item_id = str(uuid.uuid4())
        device = self.headers.get("X-Nexus-Device", "Windows NEXUS")[:100]
        metadata = {"id": item_id, "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "exportedAt": envelope["exportedAt"], "size": len(body), "device": device}
        atomic_write(DATA_DIR / (item_id + ".blob"), body)
        atomic_write(DATA_DIR / (item_id + ".meta"), json.dumps(metadata, ensure_ascii=False).encode("utf-8"))
        self.respond(201, metadata)


def main() -> None:
    if len(TOKEN) < 32:
        raise SystemExit("NEXUS_BACKUP_TOKEN must contain at least 32 characters")
    DATA_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(DATA_DIR, 0o700)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()

