import base64
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest import mock
from http.server import ThreadingHTTPServer
from pathlib import Path

import nexus_backup


class BackupApiTest(unittest.TestCase):
    def test_daily_domains_sync_and_old_clients_cannot_drop_them(self):
        tables = nexus_backup.SYNC_TABLES | nexus_backup.INVESTMENT_TABLES | nexus_backup.LIFE_TABLES | nexus_backup.GROWTH_TABLES | {'weekly_plan_tasks'} | nexus_backup.DAILY_TABLES
        snapshot = {'format':'nexus-backup','version':11,'exportedAt':'2026-10-03T00:00:00Z','tables':{name:[] for name in tables}}
        snapshot['tables']['care_checks'] = [{'id':'slot:day','slot_id':'slot','day':'2026-10-03','done':1}]
        self.assertEqual(self.request('/v1/state','PUT',json.dumps(snapshot).encode(),revision=0)[0],200)
        self.assertEqual(self.request('/v1/state')[1]['snapshot'],snapshot)
        snapshot['version'] = 10
        for table in nexus_backup.DAILY_TABLES:
            del snapshot['tables'][table]
        with self.assertRaises(urllib.error.HTTPError) as invalid:
            self.request('/v1/state','PUT',json.dumps(snapshot).encode(),revision=1)
        self.assertEqual(invalid.exception.code,426)


    def test_finance_insertion_times_survive_sync_and_cannot_be_downgraded(self):
        tables = nexus_backup.SYNC_TABLES | nexus_backup.INVESTMENT_TABLES | nexus_backup.LIFE_TABLES | nexus_backup.GROWTH_TABLES | {'weekly_plan_tasks'}
        snapshot = {'format':'nexus-backup','version':10,'exportedAt':'2026-10-03T00:00:00Z','tables':{name:[] for name in tables}}
        snapshot['tables']['finance_transactions'] = [{'id':1,'occurred_at':'2025-01-01T12:00:00','created_at':'2026-10-03T18:00:00.001Z'}]
        self.assertEqual(self.request('/v1/state','PUT',json.dumps(snapshot).encode(),revision=0)[0],200)
        self.assertEqual(self.request('/v1/state')[1]['snapshot'],snapshot)
        snapshot['version'] = 9
        with self.assertRaises(urllib.error.HTTPError) as invalid:
            self.request('/v1/state','PUT',json.dumps(snapshot).encode(),revision=1)
        self.assertEqual(invalid.exception.code,426)

    def test_multi_day_plan_links_sync_and_old_clients_cannot_drop_them(self):
        tables = nexus_backup.SYNC_TABLES | nexus_backup.INVESTMENT_TABLES | nexus_backup.LIFE_TABLES | nexus_backup.GROWTH_TABLES | {'weekly_plan_tasks'}
        snapshot = {'format':'nexus-backup','version':9,'exportedAt':'2026-10-03T00:00:00Z','tables':{name:[] for name in tables}}
        snapshot['tables']['weekly_plan_tasks'] = [{'id':'test-task','plan_id':'test-plan','task_id':'test-task'}]
        self.assertEqual(self.request('/v1/state','PUT',json.dumps(snapshot).encode(),revision=0)[0],200)
        self.assertEqual(self.request('/v1/state')[1]['snapshot'],snapshot)
        snapshot['version'] = 8
        del snapshot['tables']['weekly_plan_tasks']
        with self.assertRaises(urllib.error.HTTPError) as invalid:
            self.request('/v1/state','PUT',json.dumps(snapshot).encode(),revision=1)
        self.assertEqual(invalid.exception.code,426)

    def test_life_tables_survive_sync_and_require_the_complete_schema(self):
        snapshot = {'format':'nexus-backup','version':6,'exportedAt':'2026-09-30T00:00:00Z','tables':{name:[] for name in nexus_backup.SYNC_TABLES | nexus_backup.INVESTMENT_TABLES | nexus_backup.LIFE_TABLES}}
        snapshot['tables']['day_details'] = [{'day':'2026-09-30','contexts_json':'["work"]','achievement':'Finished a project','appetite':'normal','sleep_quality':None,'tension':None}]
        self.assertEqual(self.request('/v1/state','PUT',json.dumps(snapshot).encode(),revision=0)[0],200)
        self.assertEqual(self.request('/v1/state')[1]['snapshot'],snapshot)
        del snapshot['tables']['day_tasks']
        with self.assertRaises(urllib.error.HTTPError) as invalid:
            self.request('/v1/state','PUT',json.dumps(snapshot).encode(),revision=1)
        self.assertEqual(invalid.exception.code,400)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        nexus_backup.DATA_DIR = Path(self.temp.name)
        nexus_backup.TOKEN = "test-token-" + "x" * 40
        nexus_backup.CURRENT_REVISION = None
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), nexus_backup.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        if Path(self.temp.name).resolve().is_relative_to(Path(__file__).resolve().parent):
            self.temp.cleanup()

    def request(self, path, method="GET", body=None, token=True, revision=None):
        headers = {"Authorization": "Bearer " + nexus_backup.TOKEN} if token else {}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if revision is not None:
            headers["X-Nexus-Revision"] = str(revision)
        with urllib.request.urlopen(urllib.request.Request(self.base + path, data=body, headers=headers, method=method), timeout=5) as response:
            return response.status, json.load(response)

    def test_authenticated_upload_list_download_and_rejection(self):
        envelope = {
            "format": "nexus-encrypted-backup", "version": 1,
            "exportedAt": "2026-09-27T00:00:00Z",
            "salt": base64.b64encode(bytes(range(16))).decode(),
            "iv": base64.b64encode(bytes(range(12))).decode(),
            "tag": base64.b64encode(bytes(range(16))).decode(),
            "ciphertext": base64.b64encode(b"opaque encrypted data").decode(),
        }
        body = json.dumps(envelope).encode()
        with self.assertRaises(urllib.error.HTTPError) as denied:
            self.request("/v1/backups", token=False)
        self.assertEqual(denied.exception.code, 401)
        status, created = self.request("/v1/backups", "POST", body)
        self.assertEqual(status, 201)
        status, items = self.request("/v1/backups")
        self.assertEqual([item["id"] for item in items], [created["id"]])
        status, restored = self.request("/v1/backups/" + created["id"])
        self.assertEqual(status, 200)
        self.assertEqual(restored, envelope)
        with self.assertRaises(urllib.error.HTTPError) as invalid:
            self.request("/v1/backups", "POST", b"{}")
        self.assertEqual(invalid.exception.code, 400)

    def test_sync_state_revisions_prevent_overwriting_newer_data(self):
        snapshot = {"format": "nexus-backup", "version": 4, "exportedAt": "2026-09-28T00:00:00Z", "tables": {name: [] for name in nexus_backup.SYNC_TABLES}}
        status, initial = self.request("/v1/state")
        self.assertEqual((status, initial), (200, {"revision": 0, "snapshot": None}))
        status, saved = self.request("/v1/state", "PUT", json.dumps(snapshot).encode(), revision=0)
        self.assertEqual((status, saved), (200, {"revision": 1}))
        with self.assertRaises(urllib.error.HTTPError) as conflict:
            self.request("/v1/state", "PUT", json.dumps(snapshot).encode(), revision=0)
        self.assertEqual(conflict.exception.code, 409)
        status, current = self.request("/v1/state")
        self.assertEqual(current["revision"], 1)
        self.assertEqual(current["snapshot"], snapshot)

    def test_revision_events_are_authenticated_and_notify_only_after_a_write(self):
        with self.assertRaises(urllib.error.HTTPError) as denied:
            self.request('/v1/events',token=False)
        self.assertEqual(denied.exception.code,401)
        request=urllib.request.Request(self.base+'/v1/events',headers={'Authorization':'Bearer '+nexus_backup.TOKEN,'Origin':'https://localhost'})
        with urllib.request.urlopen(request,timeout=5) as stream:
            self.assertEqual(stream.headers['Content-Type'],'text/event-stream; charset=utf-8')
            self.assertEqual(stream.headers['X-Accel-Buffering'],'no')
            self.assertEqual(stream.headers['Access-Control-Allow-Origin'],'https://localhost')
            self.assertEqual(stream.readline(),b'data: {"revision":0}\n')
            self.assertEqual(stream.readline(),b'\n')
            snapshot={'format':'nexus-backup','version':4,'exportedAt':'2026-09-30T00:00:00Z','tables':{name:[] for name in nexus_backup.SYNC_TABLES}}
            self.request('/v1/state','PUT',json.dumps(snapshot).encode(),revision=0)
            self.assertEqual(stream.readline(),b'data: {"revision":1}\n')

    def test_retention_keeps_five_latest_copies_and_preserves_state_and_key(self):
        for i in range(9):
            item_id=f'00000000-0000-4000-8000-{i:012d}'
            (nexus_backup.DATA_DIR/(item_id+'.meta')).write_text(json.dumps({'id':item_id,'createdAt':f'2026-09-{20+i:02d}T00:00:00Z'}))
            (nexus_backup.DATA_DIR/(item_id+'.blob')).write_bytes(b'encrypted')
        (nexus_backup.DATA_DIR/'sync-state.json').write_text('{}')
        (nexus_backup.DATA_DIR/nexus_backup.AI_KEY_FILE).write_text('test-key')
        status,items=self.request('/v1/backups')
        self.assertEqual(status,200)
        self.assertEqual([x['id'][-12:] for x in items],[f'{i:012d}' for i in range(8,3,-1)])
        self.assertEqual(len(list(nexus_backup.DATA_DIR.glob('*.blob'))),5)
        self.assertEqual(len(list(nexus_backup.DATA_DIR.glob('*.meta'))),5)
        self.assertTrue((nexus_backup.DATA_DIR/'sync-state.json').exists())
        self.assertEqual((nexus_backup.DATA_DIR/nexus_backup.AI_KEY_FILE).read_text(),'test-key')

    def test_android_origin_can_use_state_endpoint(self):
        preflight = urllib.request.Request(
            self.base + "/v1/state", method="OPTIONS",
            headers={"Origin": "https://localhost", "Access-Control-Request-Method": "PUT"},
        )
        with urllib.request.urlopen(preflight, timeout=5) as response:
            self.assertEqual(response.status, 204)
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], "https://localhost")
        request = urllib.request.Request(
            self.base + "/v1/state", headers={
                "Authorization": "Bearer " + nexus_backup.TOKEN,
                "Origin": "https://localhost",
            },
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], "https://localhost")

    def test_android_ai_requires_key_and_proxies_only_authorized_requests(self):
        status, result = self.request("/v1/ai/status")
        self.assertEqual((status, result), (200, {"configured": False}))
        with self.assertRaises(urllib.error.HTTPError) as denied:
            self.request("/v1/ai/key", "PUT", json.dumps({"key": ('sk-' + 'test-key-' + '0' * 10)}).encode(), token=False)
        self.assertEqual(denied.exception.code, 401)
        status, configured = self.request("/v1/ai/key", "PUT", json.dumps({"key": ('sk-' + 'test-key-' + '0' * 10)}).encode())
        self.assertEqual((status, configured), (200, {"configured": True}))
        self.assertEqual((nexus_backup.DATA_DIR / nexus_backup.AI_KEY_FILE).read_text(), ('sk-' + 'test-key-' + '0' * 10))
        with self.assertRaises(urllib.error.HTTPError) as invalid:
            self.request("/v1/ai/complete", "POST", b"{}")
        self.assertEqual(invalid.exception.code, 400)

        def fake_openrouter(handler, path, payload):
            self.assertEqual(path, "chat/completions")
            self.assertEqual(payload["model"], "test/model")
            handler.respond(200, {"content": "{}", "requestId": "test", "inputTokens": 1, "outputTokens": 1, "costMicrousd": 10})

        with mock.patch.object(nexus_backup.Handler, "openrouter", fake_openrouter):
            status, reply = self.request("/v1/ai/complete", "POST", json.dumps({"model": "test/model", "system": "Return JSON", "user": "example", "structured": True}).encode())
        self.assertEqual(status, 200)
        self.assertEqual(reply["content"], "{}")
        preflight = urllib.request.Request(self.base + "/v1/ai/complete", method="OPTIONS", headers={"Origin": "https://localhost", "Access-Control-Request-Method": "POST"})
        with urllib.request.urlopen(preflight, timeout=5) as response:
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], "https://localhost")

    def test_native_device_key_requires_authentication_and_rejects_web_origins(self):
        self.request('/v1/ai/key','PUT',json.dumps({'key':'sk-test-native-key-123456'}).encode())
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request('/v1/ai/device-key',token=False)
        self.assertEqual(error.exception.code,401)
        status,result=self.request('/v1/ai/device-key')
        self.assertEqual((status,result),(200,{'key':'sk-test-native-key-123456'}))
        req=urllib.request.Request(self.base+'/v1/ai/device-key',headers={'Authorization':'Bearer '+nexus_backup.TOKEN,'Origin':'https://localhost'})
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(req)
        self.assertEqual(error.exception.code,403)

    def test_investment_tables_are_required_for_v5_and_v4_remains_supported(self):
        snapshot={'format':'nexus-backup','version':5,'exportedAt':'2026-09-29T00:00:00Z','tables':{name:[] for name in nexus_backup.SYNC_TABLES|nexus_backup.INVESTMENT_TABLES}}
        self.assertEqual(self.request('/v1/state','PUT',json.dumps(snapshot).encode(),revision=0)[0],200)
        del snapshot['tables']['investment_entries']
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request('/v1/state','PUT',json.dumps(snapshot).encode(),revision=1)
        self.assertEqual(error.exception.code,400)


if __name__ == "__main__":
    unittest.main()
