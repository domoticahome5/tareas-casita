from __future__ import annotations

import os
import sqlite3
from datetime import datetime
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "app.db"

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "cambia-esta-clave-secreta")
app.config["JSON_AS_ASCII"] = False


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception: Exception | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    db = sqlite3.connect(DB_PATH)
    cur = db.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL CHECK (tipo IN ('compras', 'tareas')),
            texto TEXT NOT NULL,
            estado TEXT NOT NULL DEFAULT 'pendiente',
            creado_por TEXT NOT NULL,
            fecha_creacion TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT NOT NULL,
            accion TEXT NOT NULL,
            tipo TEXT NOT NULL,
            texto TEXT NOT NULL,
            fecha TEXT NOT NULL
        )
    """)

    cur.execute("SELECT COUNT(*) FROM users")
    count = cur.fetchone()[0]
    if count == 0:
        usuarios_iniciales = [
            ("walter", generate_password_hash("1012"), "Walter"),
            ("claudia", generate_password_hash("2700"), "Claudia"),
        ]
        cur.executemany(
            "INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)",
            usuarios_iniciales,
        )

    db.commit()
    db.close()


def now_str() -> str:
    return datetime.now().strftime("%d/%m/%Y %H:%M")


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("user"):
            if request.path.startswith("/api/"):
                return jsonify({"ok": False, "message": "No autorizado"}), 401
            return redirect(url_for("index"))
        return view(*args, **kwargs)
    return wrapped


@app.route("/")
def index():
    return render_template("index.html", user=session.get("user"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.post("/api/login")
def api_login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash, display_name FROM users WHERE username = ?",
        (username,),
    ).fetchone()

    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"ok": False, "message": "Usuario o clave incorrectos"})

    user = {"id": row["id"], "username": row["username"], "nombre": row["display_name"]}
    session["user"] = user
    return jsonify({"ok": True, "user": user})


@app.get("/api/items")
@login_required
def api_items():
    db = get_db()

    compras = db.execute(
        "SELECT * FROM items WHERE tipo = 'compras' ORDER BY id DESC"
    ).fetchall()
    tareas = db.execute(
        "SELECT * FROM items WHERE tipo = 'tareas' ORDER BY id DESC"
    ).fetchall()
    logs = db.execute(
        "SELECT * FROM logs ORDER BY id DESC LIMIT 100"
    ).fetchall()
    users = db.execute(
        "SELECT id, username, display_name FROM users ORDER BY id ASC"
    ).fetchall()

    return jsonify({
        "ok": True,
        "compras": [dict(x) for x in compras],
        "tareas": [dict(x) for x in tareas],
        "logs": [dict(x) for x in logs],
        "users": [dict(x) for x in users],
    })


@app.post("/api/items/add")
@login_required
def api_add_item():
    data = request.get_json(silent=True) or {}
    tipo = data.get("tipo")
    texto = (data.get("texto") or "").strip()
    user = session["user"]["nombre"]

    if tipo not in ("compras", "tareas"):
        return jsonify({"ok": False, "message": "Tipo inválido"})
    if not texto:
        return jsonify({"ok": False, "message": "Texto vacío"})

    fecha = now_str()
    db = get_db()
    cur = db.cursor()
    cur.execute(
        "INSERT INTO items (tipo, texto, estado, creado_por, fecha_creacion) VALUES (?, ?, ?, ?, ?)",
        (tipo, texto, "pendiente", user, fecha),
    )
    cur.execute(
        "INSERT INTO logs (usuario, accion, tipo, texto, fecha) VALUES (?, ?, ?, ?, ?)",
        (user, "agregar", tipo, texto, fecha),
    )
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/items/toggle")
@login_required
def api_toggle_item():
    data = request.get_json(silent=True) or {}
    item_id = data.get("id")
    tipo = data.get("tipo")
    user = session["user"]["nombre"]

    db = get_db()
    row = db.execute(
        "SELECT * FROM items WHERE id = ? AND tipo = ?",
        (item_id, tipo),
    ).fetchone()

    if not row:
        return jsonify({"ok": False, "message": "Elemento no encontrado"})

    nuevo_estado = "hecho" if row["estado"] != "hecho" else "pendiente"
    fecha = now_str()

    db.execute("UPDATE items SET estado = ? WHERE id = ?", (nuevo_estado, item_id))
    db.execute(
        "INSERT INTO logs (usuario, accion, tipo, texto, fecha) VALUES (?, ?, ?, ?, ?)",
        (user, "cambiar_estado", tipo, row["texto"], fecha),
    )
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/items/delete")
@login_required
def api_delete_item():
    data = request.get_json(silent=True) or {}
    item_id = data.get("id")
    tipo = data.get("tipo")
    user = session["user"]["nombre"]

    db = get_db()
    row = db.execute(
        "SELECT * FROM items WHERE id = ? AND tipo = ?",
        (item_id, tipo),
    ).fetchone()

    if not row:
        return jsonify({"ok": False, "message": "Elemento no encontrado"})

    fecha = now_str()
    db.execute("DELETE FROM items WHERE id = ?", (item_id,))
    db.execute(
        "INSERT INTO logs (usuario, accion, tipo, texto, fecha) VALUES (?, ?, ?, ?, ?)",
        (user, "eliminar", tipo, row["texto"], fecha),
    )
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/users/add")
@login_required
def api_add_user():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    display_name = (data.get("display_name") or "").strip()
    password = data.get("password") or ""

    if not username or not display_name or not password:
        return jsonify({"ok": False, "message": "Completa usuario, nombre y clave"})

    db = get_db()
    existe = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existe:
        return jsonify({"ok": False, "message": "Ese usuario ya existe"})

    db.execute(
        "INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), display_name),
    )
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/users/update")
@login_required
def api_update_user():
    data = request.get_json(silent=True) or {}
    user_id = data.get("id")
    display_name = (data.get("display_name") or "").strip()
    password = data.get("password") or ""

    if not user_id or not display_name:
        return jsonify({"ok": False, "message": "Datos incompletos"})

    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return jsonify({"ok": False, "message": "Usuario no encontrado"})

    if password.strip():
        db.execute(
            "UPDATE users SET display_name = ?, password_hash = ? WHERE id = ?",
            (display_name, generate_password_hash(password), user_id),
        )
    else:
        db.execute(
            "UPDATE users SET display_name = ? WHERE id = ?",
            (display_name, user_id),
        )

    # actualizar sesión si editó su propio usuario
    if session.get("user") and session["user"]["id"] == user_id:
        session["user"]["nombre"] = display_name

    db.commit()
    return jsonify({"ok": True})


@app.post("/api/users/delete")
@login_required
def api_delete_user():
    data = request.get_json(silent=True) or {}
    user_id = data.get("id")

    if not user_id:
        return jsonify({"ok": False, "message": "Usuario inválido"})

    if session.get("user") and session["user"]["id"] == user_id:
        return jsonify({"ok": False, "message": "No puedes eliminar tu propio usuario desde tu sesión actual"})

    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return jsonify({"ok": False, "message": "Usuario no encontrado"})

    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
    return jsonify({"ok": True})


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
