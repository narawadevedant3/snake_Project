import html
import os
import re
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "snake_scores.db"
)


def get_connection(db_path: str = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str = DB_PATH) -> None:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_name TEXT NOT NULL,
                mode TEXT NOT NULL,
                grid_size INTEGER NOT NULL,
                score INTEGER NOT NULL,
                moves INTEGER NOT NULL,
                time_seconds REAL NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_scores_mode ON scores(mode)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC)")
        conn.commit()


def sanitize_player_name(name: str) -> str:
    if not name:
        return "Anonymous"
    # Strip HTML tags and special characters, keep alphanumeric, spaces, dashes, underscores
    cleaned = re.sub(r"[^\w\s\-]", "", name.strip())
    cleaned = html.escape(cleaned[:20])
    return cleaned if cleaned else "Anonymous"


def add_score(
    player_name: str,
    mode: str,
    grid_size: int,
    score: int,
    moves: int,
    time_seconds: float,
    db_path: str = DB_PATH,
) -> Dict[str, Any]:
    init_db(db_path)
    clean_name = sanitize_player_name(player_name)
    clean_mode = (mode.strip().lower() if mode in ["human", "graph", "rl"] else "human")
    grid_size = max(4, min(int(grid_size), 30))
    score = max(0, min(int(score), 10000))
    moves = max(0, min(int(moves), 100000))
    time_seconds = max(0.0, min(float(time_seconds), 86400.0))
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO scores (player_name, mode, grid_size, score, moves, time_seconds, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (clean_name, clean_mode, grid_size, score, moves, round(time_seconds, 1), now),
        )
        score_id = cursor.lastrowid
        conn.commit()

        cursor.execute("SELECT * FROM scores WHERE id = ?", (score_id,))
        row = cursor.fetchone()
        return dict(row) if row else {}


def get_top_scores(
    limit: int = 10,
    mode: Optional[str] = None,
    db_path: str = DB_PATH,
) -> List[Dict[str, Any]]:
    init_db(db_path)
    limit = max(1, min(int(limit), 50))

    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        if mode and mode.lower() in ["human", "graph", "rl"]:
            cursor.execute(
                """
                SELECT id, player_name, mode, grid_size, score, moves, time_seconds, created_at
                FROM scores
                WHERE mode = ?
                ORDER BY score DESC, moves ASC, time_seconds ASC
                LIMIT ?
                """,
                (mode.lower(), limit),
            )
        else:
            cursor.execute(
                """
                SELECT id, player_name, mode, grid_size, score, moves, time_seconds, created_at
                FROM scores
                ORDER BY score DESC, moves ASC, time_seconds ASC
                LIMIT ?
                """,
                (limit,),
            )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def get_high_score(mode: Optional[str] = None, db_path: str = DB_PATH) -> int:
    init_db(db_path)
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        if mode and mode.lower() in ["human", "graph", "rl"]:
            cursor.execute(
                "SELECT MAX(score) FROM scores WHERE mode = ?",
                (mode.lower(),),
            )
        else:
            cursor.execute("SELECT MAX(score) FROM scores")
        val = cursor.fetchone()[0]
        return int(val) if val is not None else 3
