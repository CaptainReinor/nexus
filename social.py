"""Private NEXUS groups. Publish only explicit aggregates, never another user's snapshot."""
import hashlib
import json
import math
import os
import re
import secrets
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

KINDS = {'weight', 'sleep', 'food', 'journal', 'training', 'care'}
DEFAULT_PLAN = {'weight': list(range(7)), 'sleep': list(range(7)), 'journal': list(range(7))}
PRIVACY = ('shareWeightChange', 'shareWeight', 'shareTraining')
IDENTITY = re.compile(r'^[0-9a-f-]{36}$')


class SocialError(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code
        super().__init__(code)


def text(value, maximum=60):
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= maximum or any(ord(c) < 32 for c in value):
        raise SocialError(400, 'invalid_social_input')
    return value.strip()


def day(value):
    try:
        result = date.fromisoformat(value)
        if result.isoformat() != value:
            raise ValueError()
        return result
    except (TypeError, ValueError):
        raise SocialError(400, 'invalid_day') from None


def finite(value, low, high):
    return type(value) in (int, float) and math.isfinite(value) and low <= value <= high


def valid_plan(value):
    if not isinstance(value, dict) or not 1 <= len(value) <= len(KINDS) or not set(value) <= KINDS:
        raise SocialError(400, 'invalid_plan')
    result = {}
    for key, days in value.items():
        if not isinstance(days, list) or not 1 <= len(days) <= 7 or any(type(x) is not int or x not in range(7) for x in days) or len(set(days)) != len(days):
            raise SocialError(400, 'invalid_plan')
        result[key] = sorted(days)
    return result


def facts(snapshot, start, end):
    """Unique actual recording days. Carried chart points and message counts earn nothing."""
    tables = snapshot.get('tables', {}) if isinstance(snapshot, dict) else {}
    rows = lambda name: tables.get(name, []) if isinstance(tables.get(name, []), list) else []
    boundary = None
    for row in rows('settings'):
        if row.get('key') == 'focusBoundary':
            try:
                boundary = json.loads(row['value'])['day']
                day(boundary)
            except (KeyError, ValueError, TypeError, SocialError):
                boundary = None
    # No fallback into the normal application: the focus boundary is intentional.
    if boundary is None:
        return {kind: set() for kind in KINDS}, []
    lower = max(start, boundary)
    recorded = {kind: set() for kind in KINDS}
    weights = {}
    def in_range(row, key='day'):
        value = row.get(key)
        if not isinstance(value, str) or not lower <= value <= end:
            return False
        try:
            day(value)
            return True
        except SocialError:
            return False
    for row in rows('focus_weights'):
        if in_range(row) and finite(row.get('weight_kg'), 1, 500):
            recorded['weight'].add(row['day'])
            # Deterministic choice for old snapshots with more than one measurement/day.
            previous = weights.get(row['day'])
            if previous is None or str(row.get('updated_at', row.get('id', ''))) > str(previous.get('updated_at', previous.get('id', ''))):
                weights[row['day']] = row
    for row in rows('focus_sleep'):
        if in_range(row) and finite(row.get('sleep_minutes'), 1, 1440):
            recorded['sleep'].add(row['day'])
    for row in rows('food_entries'):
        if in_range(row) and str(row.get('name', '')).strip():
            recorded['food'].add(row['day'])
    for row in rows('mentor_turns'):
        if in_range(row) and str(row.get('raw_text', '')).strip():
            recorded['journal'].add(row['day'])
    for row in rows('activity_entries'):
        if in_range(row) and row.get('type') in ('gym', 'sport'):
            recorded['training'].add(row['day'])
    for row in rows('care_checks'):
        if in_range(row) and row.get('done') == 1:
            recorded['care'].add(row['day'])
    return recorded, [weights[d] for d in sorted(weights)]


def personal_score(recorded, plans, start, end):
    score, completed, planned, days = 0, 0, 0, []
    current = day(start)
    ordered = sorted(plans, key=lambda x: x['effective_day'])
    while current.isoformat() <= end:
        stamp = current.isoformat()
        applicable = [p for p in ordered if p['effective_day'] <= stamp]
        plan = json.loads(applicable[-1]['plan_json']) if applicable else {}
        eligible = [kind for kind, weekdays in plan.items() if current.weekday() in weekdays]
        done = sum(stamp in recorded.get(kind, set()) for kind in eligible)
        points = 100 * done // len(eligible) if eligible else 0
        completed += done
        planned += len(eligible)
        score += points
        days.append({'day': stamp, 'points': points, 'done': done, 'planned': len(eligible)})
        current += timedelta(days=1)
    return {'points': score, 'completed': completed, 'planned': planned, 'days': days}


class Social:
    def __init__(self, root, accounts):
        self.root, self.accounts = Path(root), accounts
        self.path = self.root / 'social.sqlite3'
        self.lock = threading.RLock()
        self.rate_lock, self.limits = threading.Lock(), {}
        self._ready = False

    @contextmanager
    def db(self, write=False):
        with self.lock:
            connection = sqlite3.connect(self.path, timeout=10, isolation_level=None)
            connection.row_factory = sqlite3.Row
            connection.execute('PRAGMA foreign_keys=ON')
            try:
                if not self._ready:
                    connection.execute('PRAGMA journal_mode=WAL')
                    connection.executescript('''
                    CREATE TABLE IF NOT EXISTS groups (
                      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
                      timezone TEXT NOT NULL, created_day TEXT NOT NULL,
                      invite TEXT NOT NULL, invite_hash TEXT NOT NULL UNIQUE);
                    CREATE TABLE IF NOT EXISTS members (
                      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
                      user_id TEXT NOT NULL, nickname TEXT NOT NULL, joined_day TEXT NOT NULL,
                      share_change INTEGER NOT NULL DEFAULT 0,
                      share_weight INTEGER NOT NULL DEFAULT 0,
                      share_training INTEGER NOT NULL DEFAULT 0,
                      PRIMARY KEY(group_id,user_id));
                    CREATE TABLE IF NOT EXISTS plans (
                      group_id TEXT NOT NULL, user_id TEXT NOT NULL, effective_day TEXT NOT NULL,
                      plan_json TEXT NOT NULL,
                      PRIMARY KEY(group_id,user_id,effective_day),
                      FOREIGN KEY(group_id,user_id) REFERENCES members(group_id,user_id) ON DELETE CASCADE);
                    CREATE TABLE IF NOT EXISTS challenges (
                      id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
                      creator_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
                      target INTEGER NOT NULL, start_day TEXT NOT NULL, end_day TEXT NOT NULL,
                      closed INTEGER NOT NULL DEFAULT 0);
                    CREATE TABLE IF NOT EXISTS participants (
                      challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
                      group_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_day TEXT NOT NULL,
                      PRIMARY KEY(challenge_id,user_id),
                      FOREIGN KEY(group_id,user_id) REFERENCES members(group_id,user_id) ON DELETE CASCADE);
                    CREATE TABLE IF NOT EXISTS cheers (
                      group_id TEXT NOT NULL, sender_id TEXT NOT NULL, target_id TEXT NOT NULL, day TEXT NOT NULL,
                      PRIMARY KEY(group_id,sender_id,target_id,day),
                      FOREIGN KEY(group_id,sender_id) REFERENCES members(group_id,user_id) ON DELETE CASCADE,
                      FOREIGN KEY(group_id,target_id) REFERENCES members(group_id,user_id) ON DELETE CASCADE);
                    CREATE INDEX IF NOT EXISTS members_user ON members(user_id);
                    ''')
                    os.chmod(self.path, 0o600)
                    self._ready = True
                if write:
                    connection.execute('BEGIN IMMEDIATE')
                yield connection
                if write:
                    connection.execute('COMMIT')
            except BaseException:
                if connection.in_transaction:
                    connection.execute('ROLLBACK')
                raise
            finally:
                connection.close()

    def today(self, group):
        return datetime.now(ZoneInfo(group['timezone'])).date()

    def member(self, db, user, identity):
        row = db.execute('SELECT * FROM members WHERE group_id=? AND user_id=?', (identity, user['id'])).fetchone()
        if row is None:
            raise SocialError(404, 'group_not_found')
        return row

    def active_ids(self):
        with self.accounts.lock:
            return {'owner'} | {u['id'] for u in self.accounts.registry()['users'] if u['active']}

    def snapshot(self, identity):
        location = self.root if identity == 'owner' else self.root / 'users' / str(uuid.UUID(identity))
        path = location / 'sync-state.json'
        if not path.is_file():
            return {}
        try:
            return json.loads(path.read_text('utf-8')).get('snapshot') or {}
        except (OSError, ValueError, TypeError):
            return {}

    def notify(self, identities):
        for identity in set(identities):
            signal = self.accounts.signal({'id': identity})
            with signal.changed:
                signal.social_revision = getattr(signal, 'social_revision', 0) + 1
                signal.changed.notify_all()

    def invalidate(self, user):
        if not self.path.exists():
            return
        with self.db() as db:
            identities = [r[0] for r in db.execute('SELECT DISTINCT b.user_id FROM members a JOIN members b ON a.group_id=b.group_id WHERE a.user_id=?', (user['id'],))]
        self.notify(identities)

    def throttle(self, user, joining=False):
        key = (user['id'], joining)
        now = time.monotonic()
        with self.rate_lock:
            if len(self.limits) > 500:
                self.limits = {k: v for k, v in self.limits.items() if now - v[0] < 60}
            since, count = self.limits.get(key, (now, 0))
            if now - since >= 60:
                since, count = now, 0
            if count >= (8 if joining else 60):
                raise SocialError(429, 'social_rate_limit')
            self.limits[key] = (since, count + 1)

    def add_member(self, db, group, user, nickname):
        if db.execute('SELECT COUNT(*) FROM members WHERE user_id=?', (user['id'],)).fetchone()[0] >= 5:
            raise SocialError(409, 'group_limit')
        if db.execute('SELECT COUNT(*) FROM members WHERE group_id=?', (group['id'],)).fetchone()[0] >= 20:
            raise SocialError(409, 'member_limit')
        stamp = self.today(group).isoformat()
        db.execute('INSERT INTO members(group_id,user_id,nickname,joined_day) VALUES (?,?,?,?)', (group['id'], user['id'], text(nickname, 40), stamp))
        db.execute('INSERT INTO plans VALUES (?,?,?,?)', (group['id'], user['id'], stamp, json.dumps(DEFAULT_PLAN)))

    def mutation(self, user, method, path, body):
        if not isinstance(body, dict):
            raise SocialError(400, 'invalid_social_input')
        self.throttle(user, path == '/v1/social/join')
        changed = set()
        with self.db(write=True) as db:
            if path == '/v1/social/groups' and method == 'POST':
                if set(body) != {'name', 'nickname', 'timezone'}:
                    raise SocialError(400, 'invalid_social_input')
                try:
                    ZoneInfo(body['timezone'])
                except (ZoneInfoNotFoundError, TypeError, ValueError):
                    raise SocialError(400, 'invalid_timezone') from None
                code = 'NEXUS-G-' + secrets.token_hex(12).upper()
                group = {'id': str(uuid.uuid4()), 'timezone': body['timezone']}
                stamp = self.today(group).isoformat()
                db.execute('INSERT INTO groups VALUES (?,?,?,?,?,?,?)', (group['id'], user['id'], text(body['name']), body['timezone'], stamp, code, hashlib.sha256(code.encode()).hexdigest()))
                self.add_member(db, group, user, body['nickname'])
                changed.add(user['id'])
            elif path == '/v1/social/join' and method == 'POST':
                if set(body) != {'code', 'nickname'}:
                    raise SocialError(400, 'invalid_social_input')
                code = text(body['code'], 100).upper().replace(' ', '')
                group = db.execute('SELECT * FROM groups WHERE invite_hash=?', (hashlib.sha256(code.encode()).hexdigest(),)).fetchone()
                if group is None:
                    raise SocialError(404, 'invite_not_found')
                if db.execute('SELECT 1 FROM members WHERE group_id=? AND user_id=?', (group['id'], user['id'])).fetchone() is None:
                    self.add_member(db, group, user, body['nickname'])
                changed.update(r[0] for r in db.execute('SELECT user_id FROM members WHERE group_id=?', (group['id'],)))
            else:
                participation = re.fullmatch(r'/v1/social/challenges/([0-9a-f-]{36})/(join|leave)', path)
                if participation and method == 'POST' and not body:
                    challenge_id, action = participation.groups()
                    challenge = db.execute('SELECT * FROM challenges WHERE id=?', (challenge_id,)).fetchone()
                    if challenge is None:
                        raise SocialError(404, 'challenge_not_found')
                    self.member(db, user, challenge['group_id'])
                    group = db.execute('SELECT * FROM groups WHERE id=?', (challenge['group_id'],)).fetchone()
                    if action == 'join':
                        if self.today(group).isoformat() > challenge['end_day']:
                            raise SocialError(409, 'challenge_finished')
                        db.execute('INSERT OR IGNORE INTO participants VALUES (?,?,?,?)', (challenge_id, group['id'], user['id'], self.today(group).isoformat()))
                    else:
                        db.execute('DELETE FROM participants WHERE challenge_id=? AND user_id=?', (challenge_id, user['id']))
                    changed.update(r[0] for r in db.execute('SELECT user_id FROM members WHERE group_id=?', (group['id'],)))
                    # Continue below only for group operations.
                    operation = None
                else:
                    operation = 'group'
                match = re.fullmatch(r'/v1/social/groups/([0-9a-f-]{36})/(preferences|leave|invite|challenges|cheer)', path)
                if operation == 'group' and not match:
                    raise SocialError(404, 'social_not_found')
                if operation is None:
                    identity = None
                else:
                    identity = match.group(1)
                if identity is None:
                    pass
                else:
                    self.group_mutation(db, user, match, body, method, changed)
        self.notify(changed)
        return self.state(user)

    def group_mutation(self, db, user, match, body, method, changed):
        identity, operation = match.groups()
        member = self.member(db, user, identity)
        group = db.execute('SELECT * FROM groups WHERE id=?', (identity,)).fetchone()
        changed.update(r[0] for r in db.execute('SELECT user_id FROM members WHERE group_id=?', (identity,)))
        if operation == 'leave' and method == 'POST' and not body:
            if group['owner_id'] == user['id']:
                active = self.active_ids()
                successor = next((row for row in db.execute('SELECT user_id FROM members WHERE group_id=? AND user_id<>? ORDER BY joined_day,user_id', (identity, user['id'])) if row[0] in active), None)
                if successor:
                    db.execute('UPDATE groups SET owner_id=? WHERE id=?', (successor[0], identity))
                else:
                    db.execute('DELETE FROM groups WHERE id=?', (identity,))
            db.execute('DELETE FROM members WHERE group_id=? AND user_id=?', (identity, user['id']))
        elif operation == 'cheer' and method == 'POST':
            if set(body) != {'userId'} or not isinstance(body['userId'], str) or body['userId'] == user['id'] or body['userId'] not in self.active_ids():
                raise SocialError(400, 'invalid_social_input')
            if not db.execute('SELECT 1 FROM members WHERE group_id=? AND user_id=?', (identity, body['userId'])).fetchone():
                raise SocialError(404, 'group_not_found')
            db.execute('INSERT OR IGNORE INTO cheers VALUES (?,?,?,?)', (identity, user['id'], body['userId'], self.today(group).isoformat()))
        elif operation == 'invite' and method == 'POST' and not body:
            if group['owner_id'] != user['id']:
                raise SocialError(403, 'group_owner_required')
            code = 'NEXUS-G-' + secrets.token_hex(12).upper()
            db.execute('UPDATE groups SET invite=?,invite_hash=? WHERE id=?', (code, hashlib.sha256(code.encode()).hexdigest(), identity))
        elif operation == 'preferences' and method == 'PUT':
            if not set(body) <= set(PRIVACY) | {'nickname', 'plan'} or not body:
                raise SocialError(400, 'invalid_social_input')
            for key in PRIVACY:
                if key in body and type(body[key]) is not bool:
                    raise SocialError(400, 'invalid_social_input')
            db.execute('UPDATE members SET nickname=?,share_change=?,share_weight=?,share_training=? WHERE group_id=? AND user_id=?',
                       (text(body.get('nickname', member['nickname']), 40), int(body.get('shareWeightChange', bool(member['share_change']))), int(body.get('shareWeight', bool(member['share_weight']))), int(body.get('shareTraining', bool(member['share_training']))), identity, user['id']))
            if 'plan' in body:
                plan = valid_plan(body['plan'])
                # Previously scored days keep their original plan, including the joining day.
                effective = (self.today(group) + timedelta(days=1)).isoformat()
                db.execute('INSERT INTO plans VALUES (?,?,?,?) ON CONFLICT(group_id,user_id,effective_day) DO UPDATE SET plan_json=excluded.plan_json', (identity, user['id'], effective, json.dumps(plan)))
        elif operation == 'challenges' and method == 'POST':
            if set(body) != {'name', 'kind', 'target', 'endDay'} or not isinstance(body['kind'], str) or body['kind'] not in {'training', 'consistency', 'weight_checkins'} or type(body['target']) is not int or not 1 <= body['target'] <= 1000:
                raise SocialError(400, 'invalid_challenge')
            today = self.today(group)
            end = day(body['endDay'])
            if not today <= end <= today + timedelta(days=90):
                raise SocialError(400, 'invalid_challenge')
            if db.execute('SELECT COUNT(*) FROM challenges WHERE group_id=? AND end_day>=? AND closed=0', (identity, today.isoformat())).fetchone()[0] >= 8:
                raise SocialError(409, 'challenge_limit')
            challenge_id = str(uuid.uuid4())
            db.execute('INSERT INTO challenges VALUES (?,?,?,?,?,?,?,?,0)', (challenge_id, identity, user['id'], text(body['name'], 100), body['kind'], body['target'], today.isoformat(), end.isoformat()))
            db.execute('INSERT INTO participants VALUES (?,?,?,?)', (challenge_id, identity, user['id'], today.isoformat()))
        else:
            raise SocialError(400, 'invalid_social_input')

    def state(self, user):
        active = self.active_ids()
        with self.db() as db:
            groups = db.execute('SELECT g.* FROM groups g JOIN members m ON m.group_id=g.id WHERE m.user_id=? ORDER BY g.created_day,g.id', (user['id'],)).fetchall()
            result = []
            for group in groups:
                today = self.today(group)
                start = today - timedelta(days=today.weekday())
                members = []
                private_facts = {}
                cheers = [row for row in db.execute('SELECT sender_id,target_id FROM cheers WHERE group_id=? AND day=?', (group['id'], today.isoformat())) if row['sender_id'] in active and row['target_id'] in active]
                for member in db.execute('SELECT * FROM members WHERE group_id=? ORDER BY joined_day,user_id', (group['id'],)):
                    if member['user_id'] not in active:
                        continue
                    identity = member['user_id']
                    snapshot = self.snapshot(identity)
                    recorded, weights = facts(snapshot, member['joined_day'], today.isoformat())
                    plans = db.execute('SELECT * FROM plans WHERE group_id=? AND user_id=? ORDER BY effective_day', (group['id'], identity)).fetchall()
                    score_start = max(start.isoformat(), member['joined_day'])
                    score = personal_score(recorded, plans, score_start, today.isoformat())
                    public = {'id': identity, 'nickname': member['nickname'], 'points': score['points'], 'completed': score['completed'], 'planned': score['planned'], 'joinedDay': member['joined_day'], 'self': identity == user['id']}
                    public['cheers'] = sum(row['target_id'] == identity for row in cheers)
                    public['cheeredByMe'] = any(row['target_id'] == identity and row['sender_id'] == user['id'] for row in cheers)
                    if member['share_training']:
                        public['trainingDays'] = len([d for d in recorded['training'] if d >= start.isoformat()])
                    if weights:
                        if member['share_change'] and len(weights) >= 2:
                            # Do not publish kg AND percent deltas: together they reveal the hidden baseline.
                            public['weightChangeKg'] = round(weights[-1]['weight_kg'] - weights[0]['weight_kg'], 2)
                            public['weightPeriod'] = {'start': weights[0]['day'], 'end': weights[-1]['day']}
                        if member['share_weight']:
                            public['weightKg'] = weights[-1]['weight_kg']
                    if identity == user['id']:
                        public['privacy'] = dict(zip(PRIVACY, [bool(member['share_change']), bool(member['share_weight']), bool(member['share_training'])]))
                        public['plan'] = json.loads(plans[-1]['plan_json'])
                        public['planEffectiveDay'] = plans[-1]['effective_day']
                        public['days'] = score['days']
                    members.append(public)
                    private_facts[identity] = recorded
                members.sort(key=lambda x: (-x['points'], x['nickname'].casefold(), x['id']))
                previous, rank = None, 0
                for index, member in enumerate(members):
                    if member['points'] != previous:
                        rank = index + 1
                    member['rank'], previous = rank, member['points']
                challenges = []
                for challenge in db.execute('SELECT * FROM challenges WHERE group_id=? AND closed=0 ORDER BY start_day,id LIMIT 24', (group['id'],)):
                    contributions = []
                    participants = {r['user_id']: r['joined_day'] for r in db.execute('SELECT user_id,joined_day FROM participants WHERE challenge_id=?', (challenge['id'],))}
                    for member in members:
                        if member['id'] not in participants:
                            continue
                        lower = max(challenge['start_day'], participants[member['id']])
                        key = {'training': 'training', 'consistency': 'journal', 'weight_checkins': 'weight'}[challenge['kind']]
                        count = len([d for d in private_facts[member['id']][key] if lower <= d <= min(challenge['end_day'], today.isoformat())])
                        # Explicit participation shares only a count, identically to every group member.
                        contributions.append({'userId': member['id'], 'value': count})
                    challenges.append({'id': challenge['id'], 'name': challenge['name'], 'kind': challenge['kind'], 'target': challenge['target'], 'startDay': challenge['start_day'], 'endDay': challenge['end_day'], 'joined': user['id'] in participants, 'contributions': contributions, 'total': sum(c['value'] for c in contributions)})
                item = {'id': group['id'], 'name': group['name'], 'timezone': group['timezone'], 'ownerId': group['owner_id'], 'weekStart': start.isoformat(), 'weekEnd': (start + timedelta(days=6)).isoformat(), 'members': members, 'challenges': challenges}
                if group['owner_id'] == user['id']:
                    item['inviteCode'] = group['invite']
                result.append(item)
        signal = self.accounts.signal(user)
        return {'userId': user['id'], 'revision': getattr(signal, 'social_revision', 0), 'groups': result}


_stores, _lock = {}, threading.Lock()


def social(root, accounts):
    with _lock:
        key = str(Path(root).resolve())
        if key not in _stores:
            _stores[key] = Social(root, accounts)
        return _stores[key]
