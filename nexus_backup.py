"""Single-user NEXUS sync and encrypted-backup API. Bind only to loopback behind HTTPS nginx."""

import base64
import binascii
import hmac
import json
import os
import re
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


TOKEN = os.environ.get("NEXUS_BACKUP_TOKEN", "")
DATA_DIR = Path(os.environ.get("NEXUS_BACKUP_DIR", "/var/lib/nexus-backup"))
PORT = int(os.environ.get("NEXUS_BACKUP_PORT", "18743"))
MAX_BODY = 30_000_000
MAX_SYNC_BODY = 12_000_000
SYNC_LOCK = threading.Lock()
SYNC_TABLES = {
    "settings", "habits", "habit_logs", "health_daily_entries", "weight_entries", "workouts",
    "finance_accounts", "finance_categories", "finance_transactions", "finance_budgets",
    "jobs", "job_status_history", "experience_entries", "experience_cases", "job_experience_links",
    "job_ai_analyses", "ai_usage", "daily_journals",
}
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


def valid_sync_snapshot(value: object) -> bool:
    if not isinstance(value, dict) or set(value) != {"format", "version", "exportedAt", "tables"}:
        return False
    if value["format"] != "nexus-backup" or not isinstance(value["version"], int) or not 1 <= value["version"] <= 100:
        return False
    if not isinstance(value["exportedAt"], str) or len(value["exportedAt"]) > 40:
        return False
    tables = value["tables"]
    return isinstance(tables, dict) and set(tables) == SYNC_TABLES and all(
        isinstance(rows, list) and len(rows) <= 100_000 and all(isinstance(row, dict) for row in rows)
        for rows in tables.values()
    )


def read_sync_state() -> dict | None:
    path = DATA_DIR / "sync-state.json"
    return json.loads(path.read_text("utf-8")) if path.is_file() else None


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def cors_origin(self) -> str | None:
        origin = self.headers.get("Origin", "")
        return origin if origin in {"https://localhost", "http://localhost", "capacitor://localhost"} else None

    def do_OPTIONS(self) -> None:
        if self.path != "/v1/state" or not self.cors_origin():
            self.respond(403, {"error": "forbidden"})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.cors_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Nexus-Revision, Cache-Control")
        self.send_header("Vary", "Origin")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def respond(self, status: int, payload: object) -> None:
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if self.path == "/v1/state" and self.cors_origin():
            self.send_header("Access-Control-Allow-Origin", self.cors_origin())
            self.send_header("Vary", "Origin")
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
        if self.path == "/v1/state":
            with SYNC_LOCK:
                state = read_sync_state()
            self.respond(200, state if state is not None else {"revision": 0, "snapshot": None})
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

    def do_PUT(self) -> None:
        if not self.authorized():
            return
        if self.path != "/v1/state":
            self.respond(404, {"error": "not_found"})
            return
        expected = self.headers.get("X-Nexus-Revision", "")
        if not expected.isdecimal():
            self.respond(400, {"error": "revision_required"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if not 0 < length <= MAX_SYNC_BODY:
            self.respond(413, {"error": "invalid_size"})
            return
        try:
            snapshot = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError):
            self.respond(400, {"error": "invalid_json"})
            return
        if not valid_sync_snapshot(snapshot):
            self.respond(400, {"error": "invalid_snapshot"})
            return
        with SYNC_LOCK:
            current = read_sync_state()
            revision = current["revision"] if current else 0
            if str(revision) != expected:
                self.respond(409, {"error": "revision_conflict", "revision": revision})
                return
            if current:
                atomic_write(DATA_DIR / "sync-state-previous.json", json.dumps(current, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
            state = {"revision": revision + 1, "snapshot": snapshot}
            atomic_write(DATA_DIR / "sync-state.json", json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        self.respond(200, {"revision": state["revision"]})

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

