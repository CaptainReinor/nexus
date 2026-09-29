"""Single-user NEXUS sync and encrypted-backup API. Bind only to loopback behind HTTPS nginx."""

import base64
import binascii
import hmac
import json
import os
import re
import tempfile
import threading
import urllib.error
import urllib.request
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
BACKUP_LOCK = threading.Lock()
BACKUP_KEEP = 5
SYNC_TABLES = {
    "settings", "habits", "habit_logs", "health_daily_entries", "weight_entries", "workouts",
    "finance_accounts", "finance_categories", "finance_transactions", "finance_budgets",
    "jobs", "job_status_history", "experience_entries", "experience_cases", "job_experience_links",
    "job_ai_analyses", "ai_usage", "daily_journals",
}
ID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
AI_KEY_FILE = "openrouter-key"
INVESTMENT_TABLES = {"investment_accounts", "investment_entries"}


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
    expected = SYNC_TABLES | INVESTMENT_TABLES if value['version'] >= 5 else SYNC_TABLES
    return isinstance(tables, dict) and set(tables) == expected and all(
        isinstance(rows, list) and len(rows) <= 100_000 and all(isinstance(row, dict) for row in rows)
        for rows in tables.values()
    )


def read_sync_state() -> dict | None:
    path = DATA_DIR / "sync-state.json"
    return json.loads(path.read_text("utf-8")) if path.is_file() else None


def prune_backups() -> list[dict]:
    """Caller holds BACKUP_LOCK. Only remove recognized backup metadata/blob pairs."""
    items = []
    for path in DATA_DIR.glob('*.meta'):
        try:
            item = json.loads(path.read_text('utf-8'))
            item_id = item['id']
            if ID_RE.fullmatch(item_id) and path.name == item_id + '.meta' and isinstance(item['createdAt'], str) and (DATA_DIR / (item_id + '.blob')).is_file():
                items.append(item)
        except (OSError, ValueError, KeyError, TypeError):
            continue
    items.sort(key=lambda item: (item['createdAt'], item['id']), reverse=True)
    for item in items[BACKUP_KEEP:]:
        (DATA_DIR / (item['id'] + '.meta')).unlink(missing_ok=True)
        (DATA_DIR / (item['id'] + '.blob')).unlink(missing_ok=True)
    return items[:BACKUP_KEEP]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def cors_origin(self) -> str | None:
        origin = self.headers.get("Origin", "")
        return origin if origin in {"https://localhost", "http://localhost", "capacitor://localhost"} else None

    def do_OPTIONS(self) -> None:
        if not (self.path == "/v1/state" or self.path.startswith("/v1/ai/")) or not self.cors_origin():
            self.respond(403, {"error": "forbidden"})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.cors_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")
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
        if self.path != "/v1/ai/device-key" and (self.path == "/v1/state" or self.path.startswith("/v1/ai/")) and self.cors_origin():
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

    def read_json(self, limit: int) -> object | None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= limit:
                self.respond(413, {"error": "invalid_size"})
                return None
            value = json.loads(self.rfile.read(length))
            if value is None:
                self.respond(400, {"error": "invalid_json"})
            return value
        except (ValueError, UnicodeDecodeError):
            self.respond(400, {"error": "invalid_json"})
            return None

    def openrouter(self, path: str, payload: dict) -> None:
        key_path = DATA_DIR / AI_KEY_FILE
        if not key_path.is_file():
            self.respond(409, {"error": "ai_key_missing"})
            return
        key = key_path.read_text("utf-8").strip()
        request = urllib.request.Request(
            "https://openrouter.ai/api/v1/" + path,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Authorization": "Bearer " + key, "Content-Type": "application/json", "X-Title": "NEXUS", "User-Agent": "NEXUS/0.2.2"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=100) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            try:
                details = json.loads(error.read(32_000)).get('error', {})
                message = str(details.get('message', ''))[:500].replace(key, '[redacted]')
            except (ValueError, AttributeError):
                message = 'OpenRouter blocked the VPS request.' if error.code == 403 else ''
            self.log_error('OpenRouter HTTP %s; model=%s', error.code, payload.get('model', ''))
            self.respond(502, {"error": "openrouter_http", "status": error.code, "message": message})
            return
        except (urllib.error.URLError, TimeoutError, ValueError):
            self.respond(502, {"error": "openrouter_unavailable"})
            return
        if not isinstance(result, dict):
            self.respond(502, {"error": "openrouter_invalid"})
            return
        if result.get('error'):
            details = result['error'] if isinstance(result['error'], dict) else {}
            self.respond(502, {'error':'openrouter_http','status':details.get('code',502),'message':str(details.get('message',''))[:500].replace(key,'[redacted]')})
            return
        if path == "chat/completions":
            content = (result.get("choices") or [{}])[0].get("message", {}).get("content")
            usage = result.get("usage") or {}
            input_tokens, output_tokens = usage.get("prompt_tokens"), usage.get("completion_tokens")
        else:
            content = result.get("text")
            usage = result.get("usage") or {}
            input_tokens, output_tokens = usage.get("input_tokens"), usage.get("output_tokens")
        if not isinstance(content, str) or not content.strip():
            self.respond(502, {"error": "openrouter_empty"})
            return
        cost = usage.get("cost")
        self.respond(200, {"content": content, "requestId": result.get("id", ""), "inputTokens": input_tokens, "outputTokens": output_tokens, "costMicrousd": round(cost * 1_000_000) if isinstance(cost, (float, int)) and cost >= 0 else None})

    def do_GET(self) -> None:
        if self.path == "/health":
            self.respond(200, {"status": "ok"})
            return
        if not self.authorized():
            return
        if self.path == "/v1/ai/device-key":
            # Native clients use the key in memory; never export it to a browser origin.
            if self.headers.get('Origin'):
                self.respond(403, {'error':'native_client_required'})
                return
            path = DATA_DIR / AI_KEY_FILE
            if not path.is_file():
                self.respond(409, {'error':'ai_key_missing'})
                return
            self.respond(200, {'key':path.read_text('utf-8').strip()})
            return
        if self.path == "/v1/ai/status":
            self.respond(200, {"configured": (DATA_DIR / AI_KEY_FILE).is_file()})
            return
        if self.path == "/v1/state":
            with SYNC_LOCK:
                state = read_sync_state()
            self.respond(200, state if state is not None else {"revision": 0, "snapshot": None})
            return
        if self.path == "/v1/backups":
            with BACKUP_LOCK:
                items = prune_backups()
            self.respond(200, items)
            return
        if self.path.startswith("/v1/backups/"):
            item_id = self.path.rsplit("/", 1)[-1]
            if not ID_RE.fullmatch(item_id):
                self.respond(404, {"error": "not_found"})
                return
            path = DATA_DIR / (item_id + ".blob")
            with BACKUP_LOCK:
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
        if self.path == "/v1/ai/key":
            body = self.read_json(1024)
            if body is None:
                return
            key = body.get("key") if isinstance(body, dict) else None
            if not isinstance(key, str) or not 16 <= len(key.strip()) <= 512:
                self.respond(400, {"error": "invalid_key"})
                return
            atomic_write(DATA_DIR / AI_KEY_FILE, key.strip().encode("utf-8"))
            self.respond(200, {"configured": True})
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
        if self.path == "/v1/ai/complete":
            body = self.read_json(100_000)
            if body is None:
                return
            if not isinstance(body, dict) or not isinstance(body.get("model"), str) or not re.fullmatch(r"[A-Za-z0-9._:/+-]{3,200}", body["model"]) or not isinstance(body.get("system"), str) or len(body["system"]) > 20_000 or not isinstance(body.get("user"), str) or len(body["user"]) > 50_000 or not isinstance(body.get("structured"), bool):
                self.respond(400, {"error": "invalid_ai_request"})
                return
            model = body["model"]
            gpt6 = re.fullmatch(r"openai/gpt-6-(luna|sol|astra)", model)
            generation = {"max_tokens": 6000, "reasoning": {"effort": "low" if gpt6.group(1) == "luna" else "medium"}} if gpt6 else {"max_tokens": 6000, "temperature": 0.2}
            payload = {"model": model, "messages": [{"role": "system", "content": body["system"]}, {"role": "user", "content": body["user"]}], **generation, "stream": False, "usage": {"include": True}}
            if body["structured"]:
                payload["response_format"] = {"type": "json_object"}
            self.openrouter("chat/completions", payload)
            return
        if self.path == "/v1/ai/transcribe":
            body = self.read_json(27_000_000)
            if body is None:
                return
            if not isinstance(body, dict) or not isinstance(body.get("model"), str) or not re.fullmatch(r"[A-Za-z0-9._:/+-]{3,200}", body["model"]) or body.get("format") not in {"webm", "wav", "mp3", "m4a", "ogg", "aac", "flac"} or not isinstance(body.get("base64"), str) or not 1 <= len(body["base64"]) <= 26_000_000:
                self.respond(400, {"error": "invalid_audio_request"})
                return
            self.openrouter("audio/transcriptions", {"model": body["model"], "input_audio": {"data": body["base64"], "format": body["format"]}, "language": "ru"})
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
        with BACKUP_LOCK:
            atomic_write(DATA_DIR / (item_id + ".blob"), body)
            atomic_write(DATA_DIR / (item_id + ".meta"), json.dumps(metadata, ensure_ascii=False).encode("utf-8"))
            prune_backups()
        self.respond(201, metadata)


def main() -> None:
    if len(TOKEN) < 32:
        raise SystemExit("NEXUS_BACKUP_TOKEN must contain at least 32 characters")
    DATA_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(DATA_DIR, 0o700)
    with BACKUP_LOCK:
        prune_backups()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()

