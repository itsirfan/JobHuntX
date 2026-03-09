import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agentx.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT 'New Chat',
            model TEXT NOT NULL DEFAULT 'deepseek-r1:14b',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS music_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL UNIQUE,
            prompt TEXT NOT NULL,
            style TEXT DEFAULT '',
            duration INTEGER NOT NULL DEFAULT 10,
            file_size INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
    """)
    conn.commit()
    conn.close()


# --- Conversations ---

def create_conversation(title="New Chat", model="deepseek-r1:14b"):
    conn = get_connection()
    now = datetime.now().isoformat()
    cursor = conn.execute(
        "INSERT INTO conversations (title, model, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (title, model, now, now),
    )
    conv_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return conv_id


def get_conversations():
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM conversations ORDER BY updated_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_conversation(conv_id):
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM conversations WHERE id = ?", (conv_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def update_conversation_title(conv_id, title):
    conn = get_connection()
    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
        (title, now, conv_id),
    )
    conn.commit()
    conn.close()


def update_conversation_model(conv_id, model):
    conn = get_connection()
    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE conversations SET model = ?, updated_at = ? WHERE id = ?",
        (model, now, conv_id),
    )
    conn.commit()
    conn.close()


def delete_conversation(conv_id):
    conn = get_connection()
    conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    conn.commit()
    conn.close()


# --- Messages ---

def add_message(conv_id, role, content):
    conn = get_connection()
    now = datetime.now().isoformat()
    cursor = conn.execute(
        "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
        (conv_id, role, content, now),
    )
    msg_id = cursor.lastrowid
    conn.execute(
        "UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conv_id)
    )
    conn.commit()
    conn.close()
    return msg_id


def get_messages(conv_id):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
        (conv_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# --- Music Tracks ---

def add_music_track(filename, prompt, style="", duration=10, file_size=0):
    conn = get_connection()
    now = datetime.now().isoformat()
    conn.execute(
        "INSERT INTO music_tracks (filename, prompt, style, duration, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (filename, prompt, style, duration, file_size, now),
    )
    conn.commit()
    conn.close()


def get_music_tracks():
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM music_tracks ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_music_track(filename):
    conn = get_connection()
    conn.execute("DELETE FROM music_tracks WHERE filename = ?", (filename,))
    conn.commit()
    conn.close()


# Initialize DB on import
init_db()
