from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path(os.getenv("FIFO_DB_PATH", "./data/fifo.db"))


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with _connect() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                organization TEXT,
                role TEXT,
                url TEXT,
                deadline TEXT,
                status TEXT NOT NULL DEFAULT 'new',
                payload TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        db.commit()


def get_profile() -> dict[str, Any]:
    with _connect() as db:
        row = db.execute("SELECT payload FROM profile WHERE id = 1").fetchone()
    return json.loads(row["payload"]) if row else {}


def save_profile(payload: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    encoded = json.dumps(payload, ensure_ascii=False)
    with _connect() as db:
        db.execute(
            """
            INSERT INTO profile(id, payload, updated_at)
            VALUES(1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
            """,
            (encoded, now),
        )
        db.commit()
    return payload


def list_applications() -> list[dict[str, Any]]:
    with _connect() as db:
        rows = db.execute(
            "SELECT * FROM applications ORDER BY COALESCE(deadline, '9999') ASC, id DESC"
        ).fetchall()
    return [_row_to_application(row) for row in rows]


def create_application(data: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as db:
        cursor = db.execute(
            """
            INSERT INTO applications(title, organization, role, url, deadline, status, payload, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["title"], data.get("organization"), data.get("role"), data.get("url"),
                data.get("deadline"), data.get("status", "new"),
                json.dumps(data.get("payload") or {}, ensure_ascii=False), now, now,
            ),
        )
        db.commit()
        row = db.execute("SELECT * FROM applications WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return _row_to_application(row)


def _row_to_application(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    item["payload"] = json.loads(item.get("payload") or "{}")
    return item
