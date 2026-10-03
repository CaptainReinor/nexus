"""Invitation-only NEXUS sync and encrypted-backup API, behind HTTPS nginx."""

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
import math
from accounts import accounts, AccountError
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


TOKEN = os.environ.get("NEXUS_BACKUP_TOKEN", "")
DATA_DIR = Path(os.environ.get("NEXUS_BACKUP_DIR", "/var/lib/nexus-backup"))
PORT = int(os.environ.get("NEXUS_BACKUP_PORT", "18743"))
MAX_BODY = 30_000_000
MAX_SYNC_BODY = 12_000_000
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
API_VERSION = "0.5.2"
OPENROUTER_BASE = os.environ.get("NEXUS_OPENROUTER_BASE", "https://openrouter.ai/api/v1").rstrip("/")
RELAY_KEY = os.environ.get("NEXUS_AI_RELAY_KEY", "")
INVESTMENT_TABLES = {"investment_accounts", "investment_entries"}
GROWTH_TABLES = {"financial_goals", "weekly_plans", "recurring_tasks", "recurring_skips", "custom_metrics", "metric_entries"}
LIFE_TABLES = {"day_details", "day_tasks", "day_memories", "assistant_reviews"}


def atomic_write(path: Path, content: bytes) -> None:
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".new-", delete=False) as temp:
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
    if value["format"] != "nexus-backup" or type(value["version"]) is not int or not 1 <= value["version"] <= 10:
        return False
    if not isinstance(value["exportedAt"], str) or len(value["exportedAt"]) > 40:
        return False
    tables = value["tables"]
    expected = SYNC_TABLES | INVESTMENT_TABLES if value['version'] >= 5 else SYNC_TABLES
    if value['version'] >= 6:
        expected |= LIFE_TABLES
    if value['version'] >= 8:
        expected |= GROWTH_TABLES
    if value['version'] >= 9:
        expected |= {'weekly_plan_tasks'}
    return isinstance(tables, dict) and set(tables) == expected and all(
        isinstance(rows, list) and len(rows) <= 100_000 and all(isinstance(row, dict) for row in rows)
        for rows in tables.values()
    )


def read_sync_state(data_dir=None) -> dict | None:
    path = (data_dir or DATA_DIR) / "sync-state.json"
    return json.loads(path.read_text("utf-8")) if path.is_file() else None


def prune_backups(data_dir=None) -> list[dict]:
    """Caller holds BACKUP_LOCK. Only remove recognized backup metadata/blob pairs."""
    data_dir = data_dir or DATA_DIR
    items = []
    for path in data_dir.glob('*.meta'):
        try:
            item = json.loads(path.read_text('utf-8'))
            item_id = item['id']
            if ID_RE.fullmatch(item_id) and path.name == item_id + '.meta' and isinstance(item['createdAt'], str) and (data_dir / (item_id + '.blob')).is_file():
                items.append(item)
        except (OSError, ValueError, KeyError, TypeError):
            continue
    items.sort(key=lambda item: (item['createdAt'], item['id']), reverse=True)
    for item in items[BACKUP_KEEP:]:
        (data_dir / (item['id'] + '.meta')).unlink(missing_ok=True)
        (data_dir / (item['id'] + '.blob')).unlink(missing_ok=True)
    return items[:BACKUP_KEEP]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def cors_origin(self) -> str | None:
        origin = self.headers.get("Origin", "")
        return origin if origin in {"https://localhost", "http://localhost", "capacitor://localhost"} else None

    def do_OPTIONS(self) -> None:
        if not (self.path in {"/v1/state", "/v1/events", "/v1/profile"} or self.path.startswith("/v1/ai/")) or not self.cors_origin():
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
        if self.path != "/v1/ai/device-key" and (self.path in {"/v1/state", "/v1/profile"} or self.path.startswith("/v1/ai/")) and self.cors_origin():
            self.send_header("Access-Control-Allow-Origin", self.cors_origin())
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(data)

    def setup(self):
        super().setup()
        self.connection.settimeout(20)

    def authorized(self) -> bool:
        supplied = self.headers.get("Authorization", "")
        token = supplied[7:] if supplied.startswith("Bearer ") else ""
        self.accounts = accounts(DATA_DIR)
        self.user = self.accounts.authenticate(token, TOKEN) if 32 <= len(token) <= 512 else None
        if not self.user:
            self.respond(401, {"error": "unauthorized"})
            return False
        self.data_dir = self.accounts.directory(self.user)
        self.signal = self.accounts.signal(self.user)
        return True

    def owner_only(self):
        if self.user['role'] != 'owner':
            self.respond(403, {'error': 'owner_required'})
            return False
        return True

    def create_user(self):
        if not self.owner_only(): return
        body = self.read_json(4096)
        if body is None: return
        if not isinstance(body, dict) or not {'name', 'monthlyLimitCents'} <= set(body) or not set(body) <= {'name','monthlyLimitCents','aiCredentials'}:
            self.respond(400, {'error': 'invalid_user'}); return
        owner_state = read_sync_state(DATA_DIR)
        owner_settings = owner_state['snapshot']['tables']['settings'] if owner_state and owner_state.get('snapshot') else []
        models = {key: '' for key in ('cheapModel','standardModel','advancedModel','transcriptionModel')}
        for row in owner_settings:
            if row.get('key') in models:
                try:
                    value = json.loads(row['value'])
                    if isinstance(value, str): models[row['key']] = value
                except (ValueError, TypeError): pass
        try:
            user, token = self.accounts.create(body['name'], body['monthlyLimitCents'], models, body.get('aiCredentials'))
            settings = {**models, 'currency':'RUB','aiEnabled':True,'aiBudgetCents':body['monthlyLimitCents'],'weeklyTarget':15}
            snapshot = {'format':'nexus-backup','version':6,'exportedAt':datetime.now(timezone.utc).isoformat(),'tables':{name:[] for name in SYNC_TABLES | INVESTMENT_TABLES | LIFE_TABLES}}
            snapshot['tables']['finance_accounts'] = [{'id':700000000000,'name':'Дебет','opening_cents':0,'active':1}]
            snapshot['tables']['finance_categories'] = [{'id':700000000100+i,'name':name,'kind':'expense','active':1} for i,name in enumerate(('Продукты','Кафе и рестораны','Транспорт','Жильё и счета','Здоровье','Покупки','Развлечения','Подписки','Прочее'))]
            snapshot['tables']['settings'] = [{'key':key,'value':json.dumps(value,ensure_ascii=False)} for key,value in settings.items()]
            atomic_write(self.accounts.directory(user) / 'sync-state.json', json.dumps({'revision':1,'snapshot':snapshot},ensure_ascii=False).encode())
            user, code = self.accounts.invitation(user['id'])
            self.respond(201, {'user':self.accounts.public(user),'token':token,'code':code})
        except AccountError as error:
            self.respond(error.status, {'error':error.code})

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
        if self.user['role'] != 'owner':
            self.respond(403, {'error':'device_ai_required'})
            return
        key_path = DATA_DIR / AI_KEY_FILE
        if not key_path.is_file():
            self.respond(409, {"error": "ai_key_missing"})
            return
        key = key_path.read_text("utf-8").strip()
        request = urllib.request.Request(
            OPENROUTER_BASE + "/" + path,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Authorization": "Bearer " + key, "Content-Type": "application/json", "X-Title": "NEXUS", "User-Agent": "NEXUS/0.4.1", "X-Nexus-Relay-Key": RELAY_KEY},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=100) as response:
                raw = response.read(1_000_001)
                if len(raw) > 1_000_000:
                    raise ValueError('upstream_response_too_large')
                result = json.loads(raw)
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
            choices = result.get('choices')
            first = choices[0] if isinstance(choices,list) and choices and isinstance(choices[0],dict) else {}
            message = first.get('message')
            content = message.get('content') if isinstance(message,dict) else None
            usage = result.get('usage') if isinstance(result.get('usage'),dict) else {}
            input_tokens, output_tokens = usage.get("prompt_tokens"), usage.get("completion_tokens")
        else:
            content = result.get("text")
            usage = result.get('usage') if isinstance(result.get('usage'),dict) else {}
            input_tokens, output_tokens = usage.get("input_tokens"), usage.get("output_tokens")
        if not isinstance(content, str) or not content.strip():
            self.respond(502, {"error": "openrouter_empty"})
            return
        cost = usage.get("cost")
        cost_microusd = math.ceil(cost * 1_000_000) if type(cost) in (float,int) and math.isfinite(cost) and cost >= 0 else None
        self.respond(200, {"content": content, "requestId": result.get("id", ""), "inputTokens": input_tokens, "outputTokens": output_tokens, "costMicrousd": cost_microusd})

    def do_GET(self) -> None:
        if self.path == "/health":
            self.respond(200, {"status": "ok", "version": API_VERSION})
            return
        if not self.authorized():
            return
        if self.path == '/v1/profile':
            self.respond(200, self.accounts.public(self.user)); return
        if self.path == '/v1/users':
            if not self.owner_only(): return
            users = [dict(u, role='guest') for u in self.accounts.registry()['users']]
            self.respond(200, [self.accounts.public(u) for u in users]); return
        if self.path == '/v1/events':
            self.events()
            return
        if self.path == "/v1/ai/device-key":
            # Native clients use the key in memory; never export it to a browser origin.
            if self.headers.get('Origin'):
                self.respond(403, {'error':'native_client_required'})
                return
            if self.user['role'] == 'guest':
                try:
                    self.respond(200, {'key':self.accounts.device_key(self.user)})
                except AccountError as error:
                    self.respond(error.status, {'error':error.code})
                return
            path = self.data_dir / AI_KEY_FILE
            if not path.is_file():
                self.respond(409, {'error':'ai_key_missing'})
                return
            self.respond(200, {'key':path.read_text('utf-8').strip()})
            return
        if self.path == "/v1/ai/status":
            self.respond(200, {"configured": (self.data_dir / ('ai-device-key.json' if self.user['role']=='guest' else AI_KEY_FILE)).is_file()})
            return
        if self.path == "/v1/state":
            with self.signal.lock:
                state = read_sync_state(self.data_dir)
            self.respond(200, state if state is not None else {"revision": 0, "snapshot": None})
            return
        if self.path == "/v1/backups":
            with BACKUP_LOCK:
                items = prune_backups(self.data_dir)
            self.respond(200, items)
            return
        if self.path.startswith("/v1/backups/"):
            item_id = self.path.rsplit("/", 1)[-1]
            if not ID_RE.fullmatch(item_id):
                self.respond(404, {"error": "not_found"})
                return
            path = self.data_dir / (item_id + ".blob")
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
        if self.path.startswith('/v1/users/'):
            if not self.owner_only(): return
            body = self.read_json(1024)
            if body is None: return
            try:
                user = self.accounts.update(self.path.rsplit('/',1)[-1],body)
                self.respond(200,self.accounts.public(user))
            except AccountError as error: self.respond(error.status,{'error':error.code})
            return
        if self.path == "/v1/ai/key":
            if not self.owner_only(): return
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
        with self.signal.lock:
            current = read_sync_state(self.data_dir)
            revision = current["revision"] if current else 0
            if current and current.get('snapshot') and snapshot['version'] < current['snapshot']['version']:
                self.respond(426, {'error':'schema_downgrade','version':current['snapshot']['version']})
                return
            if str(revision) != expected:
                self.respond(409, {"error": "revision_conflict", "revision": revision})
                return
            if current:
                atomic_write(self.data_dir / "sync-state-previous.json", json.dumps(current, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
            state = {"revision": revision + 1, "snapshot": snapshot}
            atomic_write(self.data_dir / "sync-state.json", json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
            self.signal.revision = state['revision']
            self.signal.changed.notify_all()
        self.respond(200, {"revision": state["revision"]})

    def events(self) -> None:
        if not self.signal.events.acquire(blocking=False):
            self.respond(429, {'error':'too_many_event_connections'})
            return
        try:
            self.send_response(200)
            self.send_header('Content-Type','text/event-stream; charset=utf-8')
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Accel-Buffering','no')
            self.send_header('X-Content-Type-Options','nosniff')
            if self.cors_origin():
                self.send_header('Access-Control-Allow-Origin',self.cors_origin())
                self.send_header('Vary','Origin')
            self.end_headers()
            self.close_connection=True
            self.connection.settimeout(30)
            last=-1
            while self.accounts.active(self.user):
                with self.signal.changed:
                    if self.signal.revision is None:
                        state=read_sync_state(self.data_dir)
                        self.signal.revision=state['revision'] if state else 0
                    if last==self.signal.revision:
                        self.signal.changed.wait(timeout=20)
                    revision=self.signal.revision
                data=(f'data: {{"revision":{revision}}}\n\n' if revision!=last else ': keepalive\n\n').encode('utf-8')
                self.wfile.write(data)
                self.wfile.flush()
                last=revision
        except (BrokenPipeError,ConnectionResetError,TimeoutError,OSError):
            pass
        finally:
            self.signal.events.release()

    def do_POST(self) -> None:
        if not self.authorized():
            return
        if self.path == "/v1/users":
            self.create_user(); return
        if self.path.startswith('/v1/users/') and self.path.endswith('/invitation'):
            if not self.owner_only(): return
            identity = self.path[len('/v1/users/'):-len('/invitation')]
            if not ID_RE.fullmatch(identity):
                self.respond(400, {'error':'invalid_user'}); return
            try:
                user, code = self.accounts.invitation(identity)
                self.respond(200, {'user':self.accounts.public(user),'code':code})
            except AccountError as error:
                self.respond(error.status, {'error':error.code})
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
            atomic_write(self.data_dir / (item_id + ".blob"), body)
            atomic_write(self.data_dir / (item_id + ".meta"), json.dumps(metadata, ensure_ascii=False).encode("utf-8"))
            prune_backups(self.data_dir)
        self.respond(201, metadata)


class BoundedServer(ThreadingHTTPServer):
    """Bound threads, including long-lived SSE and unauthenticated idle clients."""
    daemon_threads = True

    def __init__(self, *args, **kwargs):
        self.slots = threading.BoundedSemaphore(64)
        super().__init__(*args, **kwargs)

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request,address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request,address)
        finally:
            self.slots.release()


def main() -> None:
    if len(TOKEN) < 32:
        raise SystemExit("NEXUS_BACKUP_TOKEN must contain at least 32 characters")
    DATA_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(DATA_DIR, 0o700)
    with BACKUP_LOCK:
        prune_backups()
    server = BoundedServer(("127.0.0.1", PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
