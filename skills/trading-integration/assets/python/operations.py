"""Application request IDs and checkpoints; SDK journals own chain recovery."""
from __future__ import annotations

import json
import os
import re
import sqlite3
from contextlib import contextmanager
from pathlib import Path


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


class OperationStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            pass
        else:
            os.close(fd)
        if self.path.is_symlink() or self.path.stat().st_mode & 0o077:
            raise PermissionError('Operation storage must be private (mode 0600) and not a symlink')
        with self.connection() as db:
            db.execute('CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, scope TEXT NOT NULL, intent TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL)')

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            db.execute('PRAGMA synchronous=FULL')
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def decode(row):
        return None if row is None else dict(json.loads(row[4]), id=row[0], scope=row[1], intent=json.loads(row[2]), status=row[3])

    def get(self, operation_id):
        with self.connection() as db:
            return self.decode(db.execute('SELECT * FROM operations WHERE id=?', (operation_id,)).fetchone())

    def begin(self, operation_id, scope, intent, *, capacity):
        if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', operation_id):
            raise ValueError('Supply a stable application request id (1-128 letters, digits, _, ., :, -)')
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            existing = self.decode(db.execute('SELECT * FROM operations WHERE id=?', (operation_id,)).fetchone())
            if existing:
                if existing['scope'] != scope or encode(existing['intent']) != encode(intent):
                    raise ValueError('An operation id cannot change its account, network, or trade intent')
                return existing, False
            active = db.execute("SELECT COUNT(*) FROM operations WHERE scope=? AND status NOT IN ('complete','failed')", (scope,)).fetchone()[0]
            if active >= capacity:
                raise RuntimeError('Account operation capacity reached; finish or reconcile existing operations')
            db.execute('INSERT INTO operations VALUES (?,?,?,?,?)', (operation_id, scope, encode(intent), 'submitting', '{}'))
            return {'id': operation_id, 'scope': scope, 'intent': intent, 'status': 'submitting'}, True

    def transition(self, operation_id, expected, status, **patch):
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM operations WHERE id=?', (operation_id,)).fetchone()
            if row is None:
                raise KeyError(operation_id)
            if row[3] != expected:
                return False
            data = {**json.loads(row[4]), **patch}
            db.execute('UPDATE operations SET status=?,data=? WHERE id=?', (status, encode(data), operation_id))
            return True
