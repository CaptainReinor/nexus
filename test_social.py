import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

import nexus_backup
from accounts import Accounts
from social import Social, SocialError, facts, personal_score


class SocialTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.root = Path(self.temp.name)
        self.accounts = Accounts(self.root)
        self.store = Social(self.root, self.accounts)
        self.today = date(2026, 11, 17)
        self.store.today = lambda group: self.today
        self.owner = {'id': 'owner', 'role': 'owner'}
        self.guests = [self.accounts.create(name, 50, dict.fromkeys(('cheapModel', 'standardModel', 'advancedModel', 'transcriptionModel'), 'test/model'))[0] for name in ('Один', 'Два', 'Посторонний')]
        state = self.store.mutation(self.owner, 'POST', '/v1/social/groups', {'name': 'Свои', 'nickname': 'Я', 'timezone': 'Europe/Moscow'})
        self.group = state['groups'][0]
        self.path = '/v1/social/groups/' + self.group['id']

    def tearDown(self):
        self.temp.cleanup()

    def join(self, user):
        return self.store.mutation(user, 'POST', '/v1/social/join', {'code': self.group['inviteCode'], 'nickname': user['name']})

    def snapshot(self, user, weight=84):
        day = self.today.isoformat()
        snapshot = {'tables': {'settings': [{'key': 'focusBoundary', 'value': json.dumps({'day': '2026-11-16', 'at': '2026-11-16T00:00:00Z'})}], 'focus_weights': [{'day': day, 'weight_kg': weight}], 'focus_sleep': [{'day': day, 'sleep_minutes': 450}], 'mentor_turns': [{'day': day, 'raw_text': 'ЛИЧНЫЙ СЕКРЕТ', 'reply': 'НЕ ПУБЛИКОВАТЬ'}], 'activity_entries': [{'id': 'training', 'day': day, 'type': 'gym'}]}}
        directory = self.accounts.directory(user)
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'sync-state.json').write_text(json.dumps({'snapshot': snapshot}), encoding='utf-8')
        return snapshot

    def test_three_accounts_join_and_read_the_same_board_concurrently(self):
        with ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(self.join, self.guests[:2]))
            actors = [self.owner] + self.guests[:2]
            list(pool.map(self.snapshot, actors))
            states = list(pool.map(self.store.state, actors))
        for state in states:
            members = state['groups'][0]['members']
            self.assertEqual(len(members), 3)
            self.assertEqual([m['points'] for m in members], [100, 100, 100])
            self.assertEqual([m['rank'] for m in members], [1, 1, 1])
            self.assertNotIn('ЛИЧНЫЙ СЕКРЕТ', json.dumps(state))
        self.assertNotIn('inviteCode', states[1]['groups'][0])

    def test_cheers_are_member_only_once_per_day_and_do_not_increase_scores(self):
        guest = self.guests[0]
        self.join(guest)
        for _ in range(3):
            result = self.store.mutation(self.owner, 'POST', self.path + '/cheer', {'userId': guest['id']})
        member = next(m for m in result['groups'][0]['members'] if m['id'] == guest['id'])
        self.assertEqual(member['cheers'], 1)
        self.assertEqual(member['points'], 0)
        self.assertTrue(member['cheeredByMe'])
        self.assertFalse(next(m for m in self.store.state(guest)['groups'][0]['members'] if m['self'])['cheeredByMe'])
        with self.assertRaises(SocialError):
            self.store.mutation(self.guests[1], 'POST', self.path + '/cheer', {'userId': guest['id']})
        with self.assertRaises(SocialError):
            self.store.mutation(self.owner, 'POST', self.path + '/cheer', {'userId': 'owner'})
        self.today += timedelta(days=1)
        self.assertEqual(next(m for m in self.store.state(guest)['groups'][0]['members'] if m['self'])['cheers'], 0)
        self.today -= timedelta(days=1)
        self.accounts.update(guest['id'], {'active': False})
        self.assertEqual(len(self.store.state(self.owner)['groups'][0]['members']), 1)

    def test_private_weight_is_visible_only_after_consent_and_removed_on_revoke(self):
        guest = self.guests[0]
        self.join(guest)
        snapshot = self.snapshot(guest)
        self.today += timedelta(days=1)
        snapshot['tables']['focus_weights'].append({'day': self.today.isoformat(), 'weight_kg': 83.5})
        (self.accounts.directory(guest) / 'sync-state.json').write_text(json.dumps({'snapshot': snapshot}))
        member = next(m for m in self.store.state(self.owner)['groups'][0]['members'] if m['id'] == guest['id'])
        self.assertNotIn('weightKg', member)
        self.assertNotIn('weightChangeKg', member)
        self.store.mutation(guest, 'PUT', self.path + '/preferences', {'shareWeightChange': True})
        member = next(m for m in self.store.state(self.owner)['groups'][0]['members'] if m['id'] == guest['id'])
        self.assertEqual(member['weightChangeKg'], -.5)
        self.assertNotIn('weightKg', member)
        self.assertNotIn('weightChangePercent', member)
        self.store.mutation(guest, 'PUT', self.path + '/preferences', {'shareWeightChange': False})
        member = next(m for m in self.store.state(self.owner)['groups'][0]['members'] if m['id'] == guest['id'])
        self.assertNotIn('weightChangeKg', member)

    def test_outsider_cannot_read_or_mutate_another_group(self):
        outsider = self.guests[2]
        self.assertEqual(self.store.state(outsider)['groups'], [])
        for method, endpoint, body in [('PUT', self.path + '/preferences', {'shareWeight': True}), ('POST', self.path + '/leave', {}), ('POST', self.path + '/challenges', {'name': 'x'})]:
            with self.assertRaises(SocialError) as error:
                self.store.mutation(outsider, method, endpoint, body)
            self.assertEqual(error.exception.status, 404)

    def test_repeated_records_and_sync_do_not_multiply_points_and_deletion_recalculates(self):
        snapshot = self.snapshot(self.owner)
        snapshot['tables']['focus_weights'] *= 15
        snapshot['tables']['mentor_turns'] *= 40
        file = self.root / 'sync-state.json'
        file.write_text(json.dumps({'snapshot': snapshot}))
        for _ in range(3):
            self.store.invalidate(self.owner)
            self.assertEqual(self.store.state(self.owner)['groups'][0]['members'][0]['points'], 100)
        snapshot['tables']['focus_weights'] = []
        file.write_text(json.dumps({'snapshot': snapshot}))
        self.assertEqual(self.store.state(self.owner)['groups'][0]['members'][0]['points'], 66)

    def test_easier_plan_applies_tomorrow_and_cannot_rewrite_today(self):
        self.snapshot(self.owner)
        state = self.store.mutation(self.owner, 'PUT', self.path + '/preferences', {'plan': {'weight': [0, 1, 2, 3, 4, 5, 6]}})
        me = state['groups'][0]['members'][0]
        self.assertEqual(me['points'], 100)
        self.assertEqual(me['planEffectiveDay'], '2026-11-18')
        with self.store.db() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM plans').fetchone()[0], 2)

    def test_challenge_participation_is_explicit_and_counts_match_for_all_viewers(self):
        guest = self.guests[0]
        self.join(guest)
        self.snapshot(self.owner)
        self.snapshot(guest)
        state = self.store.mutation(self.owner, 'POST', self.path + '/challenges', {'name': 'В зал вместе', 'kind': 'training', 'target': 12, 'endDay': '2026-11-30'})
        challenge = state['groups'][0]['challenges'][0]
        self.assertEqual(challenge['total'], 1)
        self.assertFalse(self.store.state(guest)['groups'][0]['challenges'][0]['joined'])
        self.store.mutation(guest, 'POST', '/v1/social/challenges/' + challenge['id'] + '/join', {})
        for actor in (self.owner, guest):
            self.assertEqual(self.store.state(actor)['groups'][0]['challenges'][0]['total'], 2)
        self.store.mutation(guest, 'POST', '/v1/social/challenges/' + challenge['id'] + '/leave', {})
        self.assertEqual(self.store.state(self.owner)['groups'][0]['challenges'][0]['total'], 1)

    def test_exit_revocation_and_invite_rotation(self):
        guest = self.guests[0]
        self.join(guest)
        self.store.mutation(guest, 'POST', self.path + '/leave', {})
        self.assertEqual(self.store.state(guest)['groups'], [])
        self.store.mutation(self.owner, 'POST', self.path + '/invite', {})
        with self.assertRaises(SocialError):
            self.join(guest)
        self.group = self.store.state(self.owner)['groups'][0]
        self.join(guest)
        self.accounts.update(guest['id'], {'active': False})
        self.assertEqual(len(self.store.state(self.owner)['groups'][0]['members']), 1)

    def test_no_fallback_from_isolated_focus_into_old_personal_records(self):
        recorded, weights = facts({'tables': {'weight_entries': [{'day': '2026-11-17', 'weight_kg': 150}]}}, '2026-11-16', '2026-11-18')
        self.assertEqual(weights, [])
        self.assertFalse(any(recorded.values()))

    def test_invalid_inputs_and_invite_bruteforce_are_rejected(self):
        for body in ({'shareWeight': 'yes'}, {'score': 1000}, {'plan': {'weight': [8]}}, {'nickname': ''}):
            with self.assertRaises(SocialError):
                self.store.mutation(self.owner, 'PUT', self.path + '/preferences', body)
        for _ in range(8):
            with self.assertRaises(SocialError):
                self.store.mutation(self.guests[2], 'POST', '/v1/social/join', {'code': 'WRONG', 'nickname': 'x'})
        with self.assertRaises(SocialError) as error:
            self.store.mutation(self.guests[2], 'POST', '/v1/social/join', {'code': 'WRONG', 'nickname': 'x'})
        self.assertEqual(error.exception.status, 429)

    def test_rest_days_and_future_facts_do_not_award_points(self):
        plan = [{'effective_day': '2026-11-16', 'plan_json': json.dumps({'training': [0]})}]
        result = personal_score({'training': {'2026-11-18'}}, plan, '2026-11-17', '2026-11-17')
        self.assertEqual(result['points'], 0)
        self.assertEqual(result['planned'], 0)


class SocialHTTPTest(unittest.TestCase):
    def test_routes_authorize_three_users_and_send_small_social_events(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            root = Path(temp)
            with patch.object(nexus_backup, 'DATA_DIR', root), patch.object(nexus_backup, 'TOKEN', 'owner-test-' + 'x' * 40):
                accounts = nexus_backup.accounts(root)
                guests = [accounts.create(name, 50, dict.fromkeys(('cheapModel', 'standardModel', 'advancedModel', 'transcriptionModel'), 'test/model')) for name in ('A', 'B')]
                server = ThreadingHTTPServer(('127.0.0.1', 0), nexus_backup.Handler)
                server.daemon_threads = True
                worker = threading.Thread(target=server.serve_forever, daemon=True)
                worker.start()
                base = f'http://127.0.0.1:{server.server_port}'
                def request(token, path='/v1/social', method='GET', body=None):
                    headers = {'Authorization': 'Bearer ' + token, 'Origin': 'https://localhost'}
                    if body is not None:
                        headers['Content-Type'] = 'application/json'
                    response = urllib.request.urlopen(urllib.request.Request(base + path, headers=headers, method=method, data=json.dumps(body).encode() if body is not None else None), timeout=5)
                    self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'https://localhost')
                    with response:
                        return json.load(response)
                try:
                    state = request(nexus_backup.TOKEN, '/v1/social/groups', 'POST', {'name': 'Три человека', 'nickname': 'Я', 'timezone': 'Europe/Moscow'})
                    group = state['groups'][0]
                    with ThreadPoolExecutor(max_workers=3) as pool:
                        list(pool.map(lambda item: request(item[1], '/v1/social/join', 'POST', {'code': group['inviteCode'], 'nickname': item[0]['name']}), guests))
                        states = list(pool.map(request, [nexus_backup.TOKEN] + [g[1] for g in guests]))
                    self.assertEqual([len(s['groups'][0]['members']) for s in states], [3, 3, 3])
                    event_request = urllib.request.Request(base + '/v1/social/events', headers={'Authorization': 'Bearer ' + guests[0][1]})
                    with urllib.request.urlopen(event_request, timeout=5) as stream:
                        first = stream.readline().decode()
                        self.assertTrue(first.startswith('data: {"revision":'))
                        self.assertNotIn('snapshot', first)
                    with self.assertRaises(urllib.error.HTTPError) as invalid:
                        request('wrong')
                    self.assertEqual(invalid.exception.code, 401)
                finally:
                    server.shutdown()
                    server.server_close()
                    worker.join(timeout=3)


if __name__ == '__main__':
    unittest.main()
