import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
import nexus_backup
from accounts import accounts


class AccountApiTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        nexus_backup.DATA_DIR = Path(self.temp.name)
        nexus_backup.TOKEN = 'owner-' + 'x' * 48
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), nexus_backup.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join(2)
        self.temp.cleanup()

    def request(self, path, method='GET', value=None, token=None, revision=None):
        headers={'Authorization':'Bearer '+(token or nexus_backup.TOKEN)}
        if revision is not None: headers['X-Nexus-Revision']=str(revision)
        req=urllib.request.Request(self.base+path,method=method,headers=headers,data=json.dumps(value).encode() if value is not None else None)
        try:
            with urllib.request.urlopen(req,timeout=5) as response: return response.status,json.load(response)
        except urllib.error.HTTPError as error:
            with error: return error.code,json.load(error)

    def invite(self, name='Friend'):
        status,result=self.request('/v1/users','POST',{'name':name,'monthlyLimitCents':100})
        self.assertEqual(status,201)
        return result

    def test_two_users_cannot_read_owner_data_each_other_keys_or_account_management(self):
        one,two=self.invite('One'),self.invite('Two')
        self.assertNotEqual(one['token'],two['token'])
        self.assertNotIn('token_hash',one['user'])
        self.assertEqual(self.request('/v1/profile',token=one['token'])[1]['id'],one['user']['id'])
        owner={'format':'nexus-backup','version':6,'exportedAt':'2026-09-30','tables':{t:[] for t in nexus_backup.SYNC_TABLES | nexus_backup.INVESTMENT_TABLES | nexus_backup.LIFE_TABLES}}
        owner['tables']['settings']=[{'key':'private','value':'"owner-only"'}]
        self.assertEqual(self.request('/v1/state','PUT',owner,revision=0)[0],200)
        first=self.request('/v1/state',token=one['token'])[1]
        self.assertNotIn('owner-only',json.dumps(first))
        first['snapshot']['tables']['weight_entries']=[{'id':1,'day':'2026-09-30','weight_kg':80}]
        self.assertEqual(self.request('/v1/state','PUT',first['snapshot'],one['token'],1)[0],200)
        self.assertEqual(self.request('/v1/state',token=two['token'])[1]['snapshot']['tables']['weight_entries'],[])
        for path,method,value in [('/v1/users','GET',None),('/v1/users','POST',{'name':'Escalation','monthlyLimitCents':100}),('/v1/ai/key','PUT',{'key':'sk-attack-test-key'})]:
            self.assertEqual(self.request(path,method,value,one['token'])[0],403)
        self.assertEqual(self.request('/v1/users/'+one['user']['id'],'PUT',{'active':False})[0],200)
        self.assertEqual(self.request('/v1/state',token=one['token'])[0],401)
        self.assertEqual(self.request('/v1/state',token=two['token'])[0],200)

    def test_backup_ids_and_event_counters_belong_to_the_authenticated_account(self):
        one,two=self.invite('One'),self.invite('Two')
        store=accounts(nexus_backup.DATA_DIR)
        user_one=store.authenticate(one['token'],nexus_backup.TOKEN)
        user_two=store.authenticate(two['token'],nexus_backup.TOKEN)
        self.assertIsNot(store.signal(user_one),store.signal(user_two))
        with patch.object(nexus_backup.Handler,'events',lambda h:h.respond(200,{'account':h.user['id']})):
            self.assertEqual(self.request('/v1/events',token=one['token'])[1]['account'],one['user']['id'])
        identity='00000000-0000-4000-8000-000000000001'
        (store.directory(user_one)/(identity+'.blob')).write_bytes(b'{}')
        self.assertEqual(self.request('/v1/backups/'+identity,token=two['token'])[0],404)
        self.assertEqual(self.request('/v1/backups/'+identity,token=one['token'])[0],200)

    def test_each_native_client_receives_only_its_own_key_and_browser_origins_are_denied(self):
        keys=['sk-or-v1-'+c*64 for c in ('a','b')]
        invitations=[]
        for i,key in enumerate(keys):
            status,reply=self.request('/v1/users','POST',{'name':str(i),'monthlyLimitCents':50,'aiCredentials':{'key':key,'hash':str(i)*64,'monthlyLimitCents':50}})
            self.assertEqual(status,201)
            self.assertEqual(reply['user']['monthlyLimitCents'],50)
            self.assertNotIn(key,json.dumps(reply))
            invitations.append(reply)
        (nexus_backup.DATA_DIR/nexus_backup.AI_KEY_FILE).write_text('owner-private-key')
        for invitation,key in zip(invitations,keys):
            self.assertEqual(self.request('/v1/ai/device-key',token=invitation['token'])[1],{'key':key})
            req=urllib.request.Request(self.base+'/v1/ai/device-key',headers={'Authorization':'Bearer '+invitation['token'],'Origin':'https://localhost'})
            with self.assertRaises(urllib.error.HTTPError) as rejected:urllib.request.urlopen(req)
            self.assertEqual(rejected.exception.code,403)
            self.assertNotIn('owner-private-key',json.dumps(self.request('/v1/state',token=invitation['token'])[1]))
        self.request('/v1/users/'+invitations[0]['user']['id'],'PUT',{'active':False})
        self.assertEqual(self.request('/v1/ai/device-key',token=invitations[0]['token'])[0],401)
        self.assertEqual(self.request('/v1/ai/device-key',token=invitations[1]['token'])[0],200)
        self.assertEqual(self.request('/v1/users','POST',{'name':'Invalid','monthlyLimitCents':50,'aiCredentials':{'key':keys[0],'hash':'a'*64,'monthlyLimitCents':100}})[0],400)

    def test_old_client_cannot_discard_new_journal_tables(self):
        invitation=self.invite(); token=invitation['token']
        snapshot={'format':'nexus-backup','version':4,'exportedAt':'2026-09-30','tables':{t:[] for t in nexus_backup.SYNC_TABLES}}
        self.assertEqual(self.request('/v1/state','PUT',snapshot,token,1)[0],426)
        self.assertEqual(self.request('/v1/state',token=token)[1]['snapshot']['version'],6)
        snapshot['version']=100
        self.assertEqual(self.request('/v1/state','PUT',snapshot,token,1)[0],400)

    def test_short_codes_are_stable_private_and_revoked_with_the_user(self):
        one, two = self.invite('One'), self.invite('Two')
        code = one['code']
        self.assertRegex(code, r'^NEXUS-(?:[A-Z2-7]{4}-){5}[A-Z2-7]{4}$')
        self.assertNotEqual(code, two['code'])
        path = '/v1/users/' + one['user']['id'] + '/invitation'
        self.assertEqual(self.request(path, 'POST')[1]['code'], code)
        self.assertEqual(self.request('/v1/profile', token=code)[1]['id'], one['user']['id'])
        for guest in (one['token'], two['token'], code):
            self.assertEqual(self.request(path, 'POST', token=guest)[0], 403)
        for endpoint, token in [('/v1/users', None), ('/v1/profile', code), ('/v1/state', code)]:
            result = json.dumps(self.request(endpoint, token=token)[1])
            self.assertNotIn(code, result)
            self.assertNotIn('invite_hash', result)
        self.request('/v1/users/' + one['user']['id'], 'PUT', {'active':False})
        self.assertEqual(self.request('/v1/profile', token=code)[0], 401)
        self.assertEqual(self.request('/v1/profile', token=one['token'])[0], 401)
        self.assertEqual(self.request(path, 'POST')[1]['code'], code)
        self.request('/v1/users/' + one['user']['id'], 'PUT', {'active':True})
        self.assertEqual(self.request('/v1/profile', token=code)[0], 200)

    def test_existing_invitation_gets_a_short_code_without_changing_data_or_original_token(self):
        invitation = self.invite()
        store = accounts(nexus_backup.DATA_DIR)
        user = store.authenticate(invitation['token'], nexus_backup.TOKEN)
        directory = store.directory(user)
        (directory/'invitation.json').unlink()
        registry = store.registry()
        del registry['users'][0]['invite_hash']
        from accounts import write_private
        write_private(nexus_backup.DATA_DIR/'accounts.json', registry)
        before = (directory/'sync-state.json').read_bytes()
        path = '/v1/users/' + user['id'] + '/invitation'
        status, reply = self.request(path, 'POST')
        self.assertEqual(status, 200)
        self.assertEqual(self.request('/v1/profile', token=reply['code'])[0], 200)
        self.assertEqual(self.request('/v1/profile', token=invitation['token'])[0], 200)
        self.assertEqual((directory/'sync-state.json').read_bytes(), before)
        self.assertEqual(len(store.registry()['users']), 1)

    def test_guests_cannot_use_owner_key_via_the_server_proxy(self):
        invitation=self.invite()
        (nexus_backup.DATA_DIR/nexus_backup.AI_KEY_FILE).write_text('owner-private-key')
        self.assertEqual(self.request('/v1/ai/device-key',token=invitation['token'])[0],409)
        self.assertEqual(self.request('/v1/ai/complete','POST',{'model':'test/model','system':'JSON','user':'Example','structured':True},invitation['token'])[0],403)
        self.assertFalse(self.request('/v1/ai/status',token=invitation['token'])[1]['configured'])


if __name__=='__main__':unittest.main()
