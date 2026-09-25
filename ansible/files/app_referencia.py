#!/usr/bin/env python3
"""
Backend de referencia del Gestor Documental — Escuela Básica G-733 Chorombo Bajo.

Implementa, solo con la librería estándar de Python 3, el mismo contrato de las rutas de
compatibilidad de la API principal (sección 4.2 del documento técnico), en el puerto 8000:

    GET  /              Página de acceso (login)
    POST /login         {"username", "password"} -> {"token", "user"} | 401
    GET  /documentos    Lista JSON de los documentos visibles para el rol (Bearer token)
    POST /documentos    Registra un documento (roles directivos) -> 201 Created
    GET  /health        {"status": "ok", "db": "ok", "instance", "timestamp"} | 503

Además expone lo mínimo de /api/v1 que usan las pruebas funcionales:
    POST /api/v1/auth/login
    GET  /api/v1/documents/<id>/download-url      (403 si el rol no tiene acceso)
    POST /api/v1/documents/<id>/acknowledge
    GET  /api/v1/documents/<id>/acknowledgements  (solo directivos)

Persistencia: SQLite local (gestor_referencia.db) o MySQL si recibe DB_HOST (requiere PyMySQL).
Sirve como respaldo si la aplicación principal no está disponible y para correr las pruebas en local.

Uso:
    python3 app_referencia.py                 # SQLite, puerto 8000
    PORT=8000 DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=... python3 app_referencia.py
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import socket
import sqlite3
import sys
import threading
import time
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("PORT", "8000"))
JWT_SECRET = os.environ.get("JWT_SECRET") or secrets.token_hex(32)
TOKEN_TTL_SECONDS = 15 * 60
INSTANCE = os.environ.get("INSTANCE_ID") or socket.gethostname()
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SQLITE_PATH = os.environ.get("SQLITE_PATH", os.path.join(BASE_DIR, "gestor_referencia.db"))
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(BASE_DIR, "archivos"))
MAX_FILE_SIZE = 10 * 1024 * 1024
SEED_PASSWORD = "Colegio2026!"

DIRECTIVE_ROLES = {"DIRECTOR", "SOSTENEDOR", "EQUIPO_DIRECTIVO"}
READER_ROLES = {"DOCENTE", "APODERADO"}
ALL_ROLES = DIRECTIVE_ROLES | READER_ROLES
DOCUMENT_TYPES = {
    "MEMO": ("Memo", "MEM"),
    "OFICIO": ("Oficio", "OFI"),
    "CITACION": ("Citación", "CIT"),
    "ACUERDO": ("Acuerdo", "ACU"),
    "ACTA": ("Acta", "ACT"),
    "PERMISO_ADMINISTRATIVO": ("Permiso administrativo", "PAD"),
}
ALLOWED_MIME = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png"}


def log(message: str, **fields: Any) -> None:
    """Log en JSON (una línea por evento), igual que la API principal."""
    entry = {"time": datetime.now(timezone.utc).isoformat(), "service": "gestor-referencia", "msg": message, **fields}
    print(json.dumps(entry, ensure_ascii=False), flush=True)


# =============================================================================
# Base de datos (SQLite o MySQL con la misma interfaz mínima)
# =============================================================================

class Database:
    """Envoltorio mínimo sobre SQLite o MySQL. Las tablas usan el prefijo `ref_` para no chocar con Prisma."""

    def __init__(self) -> None:
        self.kind = "mysql" if os.environ.get("DB_HOST") else "sqlite"
        self._local = threading.local()
        self.placeholder = "%s" if self.kind == "mysql" else "?"

    def _connect(self):
        if self.kind == "mysql":
            try:
                import pymysql  # type: ignore
            except ImportError:
                log("Falta PyMySQL para usar MySQL: pip install -r requirements.txt")
                raise
            return pymysql.connect(
                host=os.environ["DB_HOST"],
                port=int(os.environ.get("DB_PORT", "3306")),
                user=os.environ.get("DB_USER", "gestor_admin"),
                password=os.environ.get("DB_PASSWORD", ""),
                database=os.environ.get("DB_NAME", "gestor_documental"),
                charset="utf8mb4",
                autocommit=True,
                connect_timeout=3,
                cursorclass=pymysql.cursors.DictCursor,
            )
        conn = sqlite3.connect(SQLITE_PATH, timeout=10, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def conn(self):
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = self._connect()
            self._local.conn = conn
        return conn

    def reset(self) -> None:
        self._local.conn = None

    def _sql(self, sql: str) -> str:
        return sql.replace("?", self.placeholder)

    def execute(self, sql: str, params: tuple = ()) -> int:
        """Ejecuta y devuelve el id insertado (si corresponde)."""
        conn = self.conn()
        cur = conn.cursor()
        cur.execute(self._sql(sql), params)
        last_id = cur.lastrowid
        if self.kind == "sqlite":
            conn.commit()
        cur.close()
        return int(last_id or 0)

    def query(self, sql: str, params: tuple = ()) -> list[dict]:
        cur = self.conn().cursor()
        cur.execute(self._sql(sql), params)
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        return rows

    def one(self, sql: str, params: tuple = ()) -> dict | None:
        rows = self.query(sql, params)
        return rows[0] if rows else None

    def ping(self) -> bool:
        try:
            self.query("SELECT 1 AS ok")
            return True
        except Exception:  # noqa: BLE001 - cualquier falla de la base se informa como 503
            self.reset()
            return False


db = Database()

AUTO_ID = "INTEGER PRIMARY KEY AUTOINCREMENT" if db.kind == "sqlite" else "INT PRIMARY KEY AUTO_INCREMENT"
TEXT = "TEXT"
VARCHAR = "VARCHAR(255)"

SCHEMA = [
    f"""CREATE TABLE IF NOT EXISTS ref_usuarios (
        id {AUTO_ID}, username {VARCHAR} NOT NULL UNIQUE, email {VARCHAR} NOT NULL UNIQUE,
        nombre {VARCHAR} NOT NULL, rol VARCHAR(30) NOT NULL, password_hash {VARCHAR} NOT NULL)""",
    f"""CREATE TABLE IF NOT EXISTS ref_documentos (
        id {AUTO_ID}, titulo {VARCHAR} NOT NULL, tipo VARCHAR(40) NOT NULL, fecha VARCHAR(10) NOT NULL,
        folio VARCHAR(30) NOT NULL, descripcion {TEXT}, autor_id INT NOT NULL, estado VARCHAR(20) NOT NULL,
        visibilidad {VARCHAR} NOT NULL, destinatarios {VARCHAR} NOT NULL, requiere_acuse INT NOT NULL,
        archivo_nombre {VARCHAR}, archivo_mime {VARCHAR}, archivo_ruta {VARCHAR}, creado_en VARCHAR(40) NOT NULL)""",
    f"""CREATE TABLE IF NOT EXISTS ref_acuses (
        id {AUTO_ID}, documento_id INT NOT NULL, usuario_id INT NOT NULL, confirmado_en VARCHAR(40) NOT NULL)""",
    f"""CREATE TABLE IF NOT EXISTS ref_descargas (
        id {AUTO_ID}, documento_id INT NOT NULL, usuario_id INT NOT NULL, descargado_en VARCHAR(40) NOT NULL)""",
]


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return f"pbkdf2${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 120_000)
    return hmac.compare_digest(candidate.hex(), digest_hex)


SEED_USERS = [
    ("directora.chorombo", "directora@colegiochorombo.cl", "Carolina Andrea Muñoz Soto", "DIRECTOR"),
    ("sostenedor.chorombo", "sostenedor@colegiochorombo.cl", "Rodrigo Esteban Lagos Pino", "SOSTENEDOR"),
    ("equipo.chorombo", "equipo@colegiochorombo.cl", "Patricia Elena Rojas Vera", "EQUIPO_DIRECTIVO"),
    ("docente.chorombo", "docente@colegiochorombo.cl", "Javier Ignacio Contreras Díaz", "DOCENTE"),
    ("apoderado1.chorombo", "apoderado1@colegiochorombo.cl", "Marcela Alejandra Fuentes Carrasco", "APODERADO"),
    ("apoderado2.chorombo", "apoderado2@colegiochorombo.cl", "Luis Alberto Espinoza Tapia", "APODERADO"),
]

# (título, tipo, fecha, visibilidad, destinatarios (usernames), requiere acuse)
SEED_DOCUMENTS = [
    ("Acta reunión apoderados 08-2026", "ACTA", "2026-08-20", ["DOCENTE", "APODERADO"], [], False),
    ("Acta reunión equipo directivo 09-2026", "ACTA", "2026-09-03", [], [], False),
    ("Memo: calendario de evaluaciones segundo semestre", "MEMO", "2026-07-28", ["DOCENTE"], [], False),
    ("Citación a entrevista de apoderado — 3° Básico A", "CITACION", "2026-08-19", [], ["apoderado1.chorombo"], True),
    ("Oficio N° 45 a DAEM María Pinto: solicitud de mantención", "OFICIO", "2026-03-18", [], [], False),
    ("Acuerdo de convivencia escolar 2026", "ACUERDO", "2026-03-10", ["DOCENTE", "APODERADO"], [], False),
    ("Permiso administrativo docente J. Contreras", "PERMISO_ADMINISTRATIVO", "2026-08-12", [], ["docente.chorombo"], False),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def next_folio(tipo: str, year: str) -> str:
    prefix = DOCUMENT_TYPES[tipo][1]
    rows = db.query("SELECT folio FROM ref_documentos WHERE tipo = ? AND folio LIKE ?", (tipo, f"{prefix}-{year}-%"))
    last = max((int(r["folio"].rsplit("-", 1)[-1]) for r in rows), default=0)
    return f"{prefix}-{year}-{last + 1:04d}"


def init_db() -> None:
    for statement in SCHEMA:
        db.execute(statement)
    try:
        _seed()
    except Exception as exc:  # noqa: BLE001 - otra instancia pudo sembrar al mismo tiempo (restricción única)
        if db.one("SELECT id FROM ref_usuarios LIMIT 1") is None:
            raise
        log("Seed omitido: la base ya fue inicializada por otra instancia", error=type(exc).__name__)
    log("Base lista", engine=db.kind)


def _seed() -> None:
    if not db.one("SELECT id FROM ref_usuarios LIMIT 1"):
        for username, email, nombre, rol in SEED_USERS:
            db.execute(
                "INSERT INTO ref_usuarios (username, email, nombre, rol, password_hash) VALUES (?, ?, ?, ?, ?)",
                (username, email, nombre, rol, hash_password(SEED_PASSWORD)),
            )
    if not db.one("SELECT id FROM ref_documentos LIMIT 1"):
        users = {u["username"]: u for u in db.query("SELECT id, username FROM ref_usuarios")}
        author = users["directora.chorombo"]["id"]
        for titulo, tipo, fecha, visibilidad, destinatarios, acuse in SEED_DOCUMENTS:
            recipient_ids = [str(users[u]["id"]) for u in destinatarios]
            db.execute(
                """INSERT INTO ref_documentos (titulo, tipo, fecha, folio, descripcion, autor_id, estado, visibilidad,
                   destinatarios, requiere_acuse, creado_en) VALUES (?, ?, ?, ?, ?, ?, 'VIGENTE', ?, ?, ?, ?)""",
                (titulo, tipo, fecha, next_folio(tipo, fecha[:4]), None, author, ",".join(visibilidad), ",".join(recipient_ids), int(acuse), now_iso()),
            )


# =============================================================================
# JWT (HS256) mínimo con la librería estándar
# =============================================================================

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def sign_token(user: dict) -> str:
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    now = int(time.time())
    payload = _b64(json.dumps({"sub": str(user["id"]), "role": user["rol"], "username": user["username"], "typ": "access", "iat": now, "exp": now + TOKEN_TTL_SECONDS}).encode())
    signature = _b64(hmac.new(JWT_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def verify_token(token: str) -> dict | None:
    try:
        header, payload, signature = token.split(".")
        expected = _b64(hmac.new(JWT_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, signature):
            return None
        data = json.loads(_unb64(payload))
        return data if data.get("exp", 0) > time.time() and data.get("typ") == "access" else None
    except (ValueError, json.JSONDecodeError):
        return None


# =============================================================================
# Reglas de acceso (mismas que backend/src/lib/permissions.ts, simplificadas)
# =============================================================================

def can_view(user: dict, doc: dict) -> bool:
    if user["rol"] in DIRECTIVE_ROLES:
        return True
    roles = set(filter(None, (doc["visibilidad"] or "").split(",")))
    recipients = set(filter(None, (doc["destinatarios"] or "").split(",")))
    return user["rol"] in roles or str(user["id"]) in recipients


def public_user(user: dict) -> dict:
    return {"id": user["id"], "username": user["username"], "fullName": user["nombre"], "email": user["email"], "role": user["rol"]}


def to_compat(doc: dict, authors: dict[int, str]) -> dict:
    tipo = doc["tipo"]
    return {
        "id": doc["id"],
        "titulo": doc["titulo"],
        "tipo": tipo,
        "tipoNombre": DOCUMENT_TYPES.get(tipo, (tipo,))[0],
        "fecha": doc["fecha"],
        "folio": doc["folio"],
        "estado": doc["estado"],
        "descripcion": doc["descripcion"],
        "autor": {"id": doc["autor_id"], "nombre": authors.get(doc["autor_id"], "")},
        "requiereAcuse": bool(doc["requiere_acuse"]),
        "visibilidad": [r for r in (doc["visibilidad"] or "").split(",") if r],
        "archivo": {"nombre": doc["archivo_nombre"], "mimeType": doc["archivo_mime"]} if doc["archivo_ruta"] else None,
        "creadoEn": doc["creado_en"],
    }


# =============================================================================
# Página de acceso y panel mínimo (mismos data-testid que la app principal)
# =============================================================================

PAGE_STYLE = """
body{margin:0;font-family:system-ui,sans-serif;background:#F7F8FE;color:#3E3B5C}
main{max-width:420px;margin:8vh auto;background:#fff;border:1px solid #E4E1F2;border-radius:20px;padding:32px}
label{display:block;font-weight:600;font-size:14px;margin:16px 0 6px}
input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #E4E1F2;border-radius:12px;font-size:15px}
button{margin-top:20px;width:100%;padding:12px;border:0;border-radius:14px;font-weight:700;font-size:15px;
background:linear-gradient(135deg,#CFE3F9,#DCD3F5);color:#3E3B5C;cursor:pointer}
.error{background:#F2C1CC;border-radius:12px;padding:10px;margin-top:14px}
.tag{display:inline-block;background:#C3B1E8;border-radius:999px;padding:2px 12px;font-size:13px;font-weight:600}
.row{border-bottom:1px solid #E4E1F2;padding:10px 0}
.wide{max-width:900px}
"""

LOGIN_HTML = f"""<!doctype html><html lang="es-CL"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Gestor Documental — Chorombo Bajo</title>
<style>{PAGE_STYLE}</style></head><body>
<main data-testid="login-screen">
<h1>Gestor Documental</h1><p>Escuela Básica G-733 Chorombo Bajo · María Pinto</p>
<p><small>Servidor de referencia</small></p>
<form id="f">
<label for="u">Usuario o email</label><input id="u" data-testid="login-username" autocomplete="username">
<label for="p">Contraseña</label><input id="p" type="password" data-testid="login-password" autocomplete="current-password">
<button type="submit" data-testid="login-submit">Ingresar</button>
<div id="e" class="error" data-testid="login-error" hidden></div>
</form></main>
<script>
document.getElementById('f').addEventListener('submit', async (ev) => {{
  ev.preventDefault();
  const r = await fetch('/login', {{method:'POST', headers:{{'Content-Type':'application/json'}},
    body: JSON.stringify({{username: document.getElementById('u').value, password: document.getElementById('p').value}})}});
  const data = await r.json();
  if (!r.ok) {{ const e = document.getElementById('e'); e.textContent = data.message || 'Error'; e.hidden = false; return; }}
  sessionStorage.setItem('ref.token', data.token); sessionStorage.setItem('ref.user', JSON.stringify(data.user));
  location.href = '/panel';
}});
</script></body></html>"""

PANEL_HTML = f"""<!doctype html><html lang="es-CL"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Panel · Gestor Documental</title>
<style>{PAGE_STYLE}</style></head><body>
<main class="wide" data-testid="dashboard-screen">
<h1>Hola, <span data-testid="user-name"></span></h1>
<p><span class="tag" data-testid="user-role"></span></p>
<h2>Documentos</h2><div id="docs" data-testid="documents-screen"></div>
</main>
<script>
const token = sessionStorage.getItem('ref.token');
if (!token) location.href = '/';
const user = JSON.parse(sessionStorage.getItem('ref.user') || '{{}}');
const labels = {{DIRECTOR:'Director(a)',SOSTENEDOR:'Sostenedor',EQUIPO_DIRECTIVO:'Equipo directivo',DOCENTE:'Docente',APODERADO:'Apoderado(a)'}};
document.querySelector('[data-testid=user-name]').textContent = user.fullName || '';
document.querySelector('[data-testid=user-role]').textContent = labels[user.role] || user.role || '';
fetch('/documentos', {{headers: {{Authorization: 'Bearer ' + token}}}}).then(r => r.json()).then(d => {{
  const box = document.getElementById('docs');
  (d.documentos || []).forEach(doc => {{
    const row = document.createElement('div'); row.className = 'row'; row.dataset.testid = 'doc-row-' + doc.id;
    row.textContent = doc.fecha + ' · ' + doc.tipoNombre + ' · ' + doc.titulo + ' (' + doc.folio + ')';
    box.appendChild(row);
  }});
}});
</script></body></html>"""


# =============================================================================
# Servidor HTTP
# =============================================================================

class HttpError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


class Handler(BaseHTTPRequestHandler):
    server_version = "GestorReferencia/1.0"
    protocol_version = "HTTP/1.1"

    # --- utilidades ------------------------------------------------------------
    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: D401 - reemplaza el log por defecto
        if not self.path.startswith("/health"):
            log("request", method=self.command, path=self.path, status=args[1] if len(args) > 1 else None)

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def json(self, status: int, data: Any) -> None:
        self._send(status, json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def html(self, page: str) -> None:
        self._send(200, page.encode(), "text/html; charset=utf-8")

    def body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length > 15 * 1024 * 1024:
            raise HttpError(413, "PAYLOAD_TOO_LARGE", "El cuerpo supera el máximo permitido")
        raw = self.rfile.read(length) if length else b""
        if not raw:
            return {}
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise HttpError(400, "INVALID_JSON", "El cuerpo de la solicitud no es JSON válido en UTF-8") from exc
        if not isinstance(data, dict):
            raise HttpError(400, "INVALID_JSON", "Se esperaba un objeto JSON")
        return data

    def current_user(self) -> dict:
        header = self.headers.get("Authorization", "")
        token = header[7:] if header.lower().startswith("bearer ") else ""
        payload = verify_token(token) if token else None
        if not payload:
            raise HttpError(401, "UNAUTHORIZED", "Falta el token de acceso o es inválido")
        user = db.one("SELECT * FROM ref_usuarios WHERE id = ?", (int(payload["sub"]),))
        if not user:
            raise HttpError(401, "UNAUTHORIZED", "Usuario inexistente")
        return user

    def document_or_error(self, user: dict, doc_id: int) -> dict:
        doc = db.one("SELECT * FROM ref_documentos WHERE id = ?", (doc_id,))
        if not doc:
            raise HttpError(404, "NOT_FOUND", "Documento no encontrado")
        if not can_view(user, doc):
            raise HttpError(403, "FORBIDDEN", "No tiene acceso a este documento")
        return doc

    # --- enrutamiento ------------------------------------------------------------
    def _dispatch(self, method: str) -> None:
        path = urlparse(self.path).path.rstrip("/") or "/"
        try:
            routes = [
                ("GET", r"/", self.get_index),
                ("GET", r"/panel(/.*)?", self.get_panel),
                ("GET", r"/health", self.get_health),
                ("POST", r"/login", self.post_login),
                ("POST", r"/api/v1/auth/login", self.post_login_v1),
                ("GET", r"/documentos", self.get_documentos),
                ("POST", r"/documentos", self.post_documentos),
                ("GET", r"/api/v1/documents/(\d+)/download-url", self.get_download_url),
                ("POST", r"/api/v1/documents/(\d+)/acknowledge", self.post_acknowledge),
                ("GET", r"/api/v1/documents/(\d+)/acknowledgements", self.get_acknowledgements),
                ("GET", r"/archivos/(\d+)", self.get_archivo),
            ]
            for route_method, pattern, handler in routes:
                match = re.fullmatch(pattern, path)
                if match and route_method == method:
                    handler(*[g for g in match.groups() if g is not None and g.isdigit()])
                    return
            raise HttpError(404, "NOT_FOUND", f"Ruta no encontrada: {method} {path}")
        except HttpError as err:
            self.json(err.status, {"error": err.code, "message": err.message})
        except Exception as exc:  # noqa: BLE001 - se responde 500 y se registra
            log("Error no controlado", error=repr(exc))
            db.reset()
            self.json(500, {"error": "INTERNAL_ERROR", "message": "Error interno del servidor"})

    def do_GET(self) -> None:  # noqa: N802 - nombre exigido por BaseHTTPRequestHandler
        self._dispatch("GET")

    def do_HEAD(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch("POST")

    # --- rutas de compatibilidad -----------------------------------------------------
    def get_index(self) -> None:
        self.html(LOGIN_HTML)

    def get_panel(self) -> None:
        self.html(PANEL_HTML)

    def get_health(self) -> None:
        base = {"instance": INSTANCE, "timestamp": now_iso()}
        if db.ping():
            self.json(200, {"status": "ok", "db": "ok", **base})
        else:
            self.json(503, {"status": "error", "db": "error", **base})

    def _authenticate(self) -> dict:
        data = self.body()
        username = str(data.get("username", "")).strip()
        password = str(data.get("password", ""))
        if not username or not password:
            raise HttpError(400, "VALIDATION_ERROR", "username y password son obligatorios")
        user = db.one("SELECT * FROM ref_usuarios WHERE username = ? OR email = ?", (username, username.lower()))
        if not user or not verify_password(password, user["password_hash"]):
            raise HttpError(401, "INVALID_CREDENTIALS", "Usuario o contraseña incorrectos")
        return user

    def post_login(self) -> None:
        user = self._authenticate()
        self.json(200, {"token": sign_token(user), "user": public_user(user)})

    def post_login_v1(self) -> None:
        user = self._authenticate()
        self.json(200, {"mfaRequired": False, "accessToken": sign_token(user), "expiresIn": TOKEN_TTL_SECONDS, "user": public_user(user)})

    def get_documentos(self) -> None:
        user = self.current_user()
        query = parse_qs(urlparse(self.path).query)
        q = (query.get("q") or [""])[0].lower()
        docs = [d for d in db.query("SELECT * FROM ref_documentos ORDER BY creado_en DESC, id DESC") if can_view(user, d)]
        if q:
            docs = [d for d in docs if q in d["titulo"].lower() or q in d["folio"].lower()]
        authors = {u["id"]: u["nombre"] for u in db.query("SELECT id, nombre FROM ref_usuarios")}
        items = [to_compat(d, authors) for d in docs]
        self.json(200, {"total": len(items), "page": 1, "pageSize": len(items), "documentos": items})

    def post_documentos(self) -> None:
        user = self.current_user()
        if user["rol"] not in DIRECTIVE_ROLES:
            raise HttpError(403, "FORBIDDEN", "No tiene permiso para esta acción")
        data = self.body()
        titulo = str(data.get("titulo", "")).strip()
        tipo = re.sub(r"[\s-]+", "_", str(data.get("tipo", "")).strip().upper()).replace("Ó", "O")
        fecha = str(data.get("fecha", ""))[:10]
        if not titulo or len(titulo) > 200:
            raise HttpError(400, "VALIDATION_ERROR", "titulo es obligatorio (máximo 200 caracteres)")
        if tipo not in DOCUMENT_TYPES:
            raise HttpError(400, "BAD_REQUEST", f"Tipo de documento desconocido: {data.get('tipo')}")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha):
            raise HttpError(400, "VALIDATION_ERROR", "fecha debe tener el formato AAAA-MM-DD")
        visibilidad = [r for r in (data.get("visibilidad") or []) if r in READER_ROLES]
        destinatarios = [str(int(x)) for x in (data.get("destinatarios") or [])]

        archivo_nombre = archivo_mime = archivo_ruta = None
        archivo = data.get("archivo")
        if isinstance(archivo, dict) and archivo.get("base64"):
            archivo_mime = str(archivo.get("mimeType", ""))
            if archivo_mime not in ALLOWED_MIME:
                raise HttpError(400, "BAD_REQUEST", "Tipo de archivo no permitido (solo PDF, DOCX, JPG o PNG)")
            content = base64.b64decode(str(archivo["base64"]).split(",")[-1])
            if len(content) > MAX_FILE_SIZE:
                raise HttpError(413, "PAYLOAD_TOO_LARGE", "El archivo supera los 10 MB")
            os.makedirs(UPLOAD_DIR, exist_ok=True)
            archivo_nombre = os.path.basename(str(archivo.get("nombre", "archivo")))[:200]
            archivo_ruta = os.path.join(UPLOAD_DIR, f"{secrets.token_hex(8)}-{re.sub(r'[^A-Za-z0-9._-]', '_', archivo_nombre)}")
            with open(archivo_ruta, "wb") as fh:
                fh.write(content)

        folio = str(data.get("folio") or "").strip() or next_folio(tipo, fecha[:4])
        doc_id = db.execute(
            """INSERT INTO ref_documentos (titulo, tipo, fecha, folio, descripcion, autor_id, estado, visibilidad, destinatarios,
               requiere_acuse, archivo_nombre, archivo_mime, archivo_ruta, creado_en)
               VALUES (?, ?, ?, ?, ?, ?, 'VIGENTE', ?, ?, ?, ?, ?, ?, ?)""",
            (titulo, tipo, fecha, folio, data.get("descripcion"), user["id"], ",".join(visibilidad), ",".join(destinatarios),
             int(bool(data.get("requiereAcuse"))), archivo_nombre, archivo_mime, archivo_ruta, now_iso()),
        )
        doc = db.one("SELECT * FROM ref_documentos WHERE id = ?", (doc_id,))
        log("Documento registrado", id=doc_id, folio=folio, user=user["username"])
        self.json(201, to_compat(doc, {user["id"]: user["nombre"]}))

    # --- /api/v1 mínimo para las pruebas -------------------------------------------
    def get_download_url(self, doc_id: str) -> None:
        user = self.current_user()
        doc = self.document_or_error(user, int(doc_id))
        db.execute("INSERT INTO ref_descargas (documento_id, usuario_id, descargado_en) VALUES (?, ?, ?)", (doc["id"], user["id"], now_iso()))
        # En la referencia no hay S3: se entrega una URL local protegida por el mismo token.
        self.json(200, {"url": f"/archivos/{doc['id']}", "expiresIn": 300, "fileName": doc["archivo_nombre"], "mimeType": doc["archivo_mime"]})

    def get_archivo(self, doc_id: str) -> None:
        user = self.current_user()
        doc = self.document_or_error(user, int(doc_id))
        if not doc["archivo_ruta"] or not os.path.exists(doc["archivo_ruta"]):
            raise HttpError(404, "NOT_FOUND", "El documento no tiene archivo adjunto")
        with open(doc["archivo_ruta"], "rb") as fh:
            self._send(200, fh.read(), doc["archivo_mime"] or "application/octet-stream")

    def post_acknowledge(self, doc_id: str) -> None:
        user = self.current_user()
        if user["rol"] not in READER_ROLES:
            raise HttpError(403, "FORBIDDEN", "Solo docentes y apoderados confirman la lectura")
        doc = self.document_or_error(user, int(doc_id))
        if not doc["requiere_acuse"]:
            raise HttpError(400, "BAD_REQUEST", "Este documento no requiere acuse de recibo")
        existing = db.one("SELECT confirmado_en FROM ref_acuses WHERE documento_id = ? AND usuario_id = ?", (doc["id"], user["id"]))
        if existing:
            self.json(200, {"acknowledgedAt": existing["confirmado_en"], "alreadyAcknowledged": True})
            return
        when = now_iso()
        db.execute("INSERT INTO ref_acuses (documento_id, usuario_id, confirmado_en) VALUES (?, ?, ?)", (doc["id"], user["id"], when))
        self.json(200, {"acknowledgedAt": when, "alreadyAcknowledged": False})

    def get_acknowledgements(self, doc_id: str) -> None:
        user = self.current_user()
        if user["rol"] not in DIRECTIVE_ROLES:
            raise HttpError(403, "FORBIDDEN", "Solo el equipo directivo ve los acuses")
        doc = self.document_or_error(user, int(doc_id))
        acks = {a["usuario_id"]: a["confirmado_en"] for a in db.query("SELECT * FROM ref_acuses WHERE documento_id = ?", (doc["id"],))}
        readers = [u for u in db.query("SELECT * FROM ref_usuarios") if u["rol"] in READER_ROLES and can_view(u, doc)]
        members = [{"userId": u["id"], "fullName": u["nombre"], "role": u["rol"], "acknowledgedAt": acks.get(u["id"])} for u in readers]
        done = sum(1 for m in members if m["acknowledgedAt"])
        self.json(200, {"requiresAcknowledgement": bool(doc["requiere_acuse"]), "total": len(members), "acknowledged": done, "pending": len(members) - done, "members": members})


def main() -> None:
    for attempt in range(1, 11):
        try:
            init_db()
            break
        except Exception as exc:  # noqa: BLE001 - la base puede tardar en estar disponible
            log("Base no disponible, reintentando", attempt=attempt, error=repr(exc))
            db.reset()
            time.sleep(3)
    else:
        log("No se pudo inicializar la base; /health responderá 503")

    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.daemon_threads = True
    log(f"Servidor de referencia escuchando en el puerto {PORT}", instance=INSTANCE, db=db.kind)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    if sys.version_info < (3, 8):
        sys.exit("Se requiere Python 3.8 o superior")
    main()
