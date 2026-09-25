#!/usr/bin/env python3
"""
Pruebas funcionales automatizadas del Gestor Documental — Escuela Básica G-733 Chorombo Bajo.

Selenium 4 (Chrome headless) + requests. Casos CP-01 a CP-07 trazados a los requisitos del
documento técnico (RF1, RF2, RF3 y RNF). Exporta resultados_pruebas_funcionales.json.

Uso:
    python tests/selenium_test_gestor_documental.py                  # BASE_URL=http://localhost:8000
    BASE_URL=http://<dns-del-alb> python tests/selenium_test_gestor_documental.py
    BASE_URL=https://<dist>.cloudfront.net HEADLESS=0 python tests/selenium_test_gestor_documental.py
    pytest tests/selenium_test_gestor_documental.py                  # también funciona con pytest

Funciona contra la API principal (Node.js) o contra app_referencia.py: ambas exponen el mismo contrato.
"""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import requests
from selenium import webdriver
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/")
PASSWORD = os.environ.get("TEST_PASSWORD", "Colegio2026!")
HEADLESS = os.environ.get("HEADLESS", "1") != "0"
TIMEOUT = int(os.environ.get("TIMEOUT", "25"))
RESULTS_FILE = Path(__file__).with_name("resultados_pruebas_funcionales.json")

USERS = {
    "directora": "directora.chorombo",
    "docente": "docente.chorombo",
    "apoderado1": "apoderado1.chorombo",
    "apoderado2": "apoderado2.chorombo",
}
DIRECTIVE_ONLY_TITLE = "Acta reunión equipo directivo 09-2026"
ACTA_TITLE = "Acta reunión apoderados 08-2026"
DOCENTE_DIRECTED_TITLE = "Permiso administrativo docente J. Contreras"


# =============================================================================
# Registro de resultados
# =============================================================================

@dataclass
class CaseResult:
    id: str
    nombre: str
    descripcion: str
    requisito: str
    rol: str
    resultado_esperado: str
    resultado_obtenido: str = ""
    estado: str = "FAIL"
    latencia_ms: float = 0.0
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class CaseFailure(AssertionError):
    pass


def check(condition: bool, message: str) -> None:
    if not condition:
        raise CaseFailure(message)


# =============================================================================
# Utilidades HTTP y navegador
# =============================================================================

session = requests.Session()


def api_login(username: str) -> dict:
    r = session.post(f"{BASE_URL}/login", json={"username": username, "password": PASSWORD}, timeout=15)
    check(r.status_code == 200, f"POST /login de {username} respondió {r.status_code}")
    data = r.json()
    check(bool(data.get("token")), "POST /login no devolvió token")
    return data


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def list_documents(token: str) -> list[dict]:
    r = session.get(f"{BASE_URL}/documentos", headers=auth(token), params={"pageSize": 100}, timeout=15)
    check(r.status_code == 200, f"GET /documentos respondió {r.status_code}")
    return r.json()["documentos"]


def tid(value: str) -> tuple[str, str]:
    return By.CSS_SELECTOR, f'[data-testid="{value}"]'


def make_driver() -> webdriver.Chrome:
    options = webdriver.ChromeOptions()
    if HEADLESS:
        options.add_argument("--headless=new")
    # Ventana ancha: la app muestra el layout de escritorio (sidebar + topbar con el rol).
    options.add_argument("--window-size=1366,900")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--lang=es-CL")
    try:
        return webdriver.Chrome(options=options)  # Selenium Manager resuelve el driver
    except WebDriverException:
        from selenium.webdriver.chrome.service import Service
        from webdriver_manager.chrome import ChromeDriverManager

        return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)


def ui_login(driver: webdriver.Chrome, username: str) -> None:
    driver.get(f"{BASE_URL}/")
    wait = WebDriverWait(driver, TIMEOUT)
    field_user = wait.until(EC.visibility_of_element_located(tid("login-username")))
    field_user.clear()
    field_user.send_keys(username)
    driver.find_element(*tid("login-password")).send_keys(PASSWORD)
    driver.find_element(*tid("login-submit")).click()
    wait.until(EC.url_contains("/panel"))


# =============================================================================
# Casos de prueba
# =============================================================================

def cp01_acceso(driver: webdriver.Chrome, res: CaseResult) -> None:
    driver.get(f"{BASE_URL}/")
    wait = WebDriverWait(driver, TIMEOUT)
    wait.until(EC.visibility_of_element_located(tid("login-screen")))
    fields = [driver.find_elements(*tid(t)) for t in ("login-username", "login-password", "login-submit")]
    check(all(fields), "No se encontraron los campos de login (login-username, login-password, login-submit)")
    res.resultado_obtenido = f"Pantalla de login cargada en {BASE_URL}/ con usuario, contraseña y botón Ingresar"


def cp02_comunicacion(driver: webdriver.Chrome, res: CaseResult) -> None:
    ui_login(driver, USERS["directora"])
    wait = WebDriverWait(driver, TIMEOUT)
    role = wait.until(EC.visibility_of_element_located(tid("user-role")))
    check("director" in role.text.lower(), f"El rol mostrado no corresponde: {role.text!r}")
    data = api_login(USERS["directora"])
    check(data["user"]["role"] == "DIRECTOR", f"POST /login devolvió rol {data['user'].get('role')}")
    res.resultado_obtenido = (
        f"Redirección a {urlpath(driver.current_url)} con rol visible «{role.text}»; POST /login devolvió token JWT"
    )


def cp03_persistencia(_driver, res: CaseResult) -> None:
    token = api_login(USERS["directora"])["token"]
    body = {"titulo": ACTA_TITLE, "tipo": "ACTA", "fecha": "2026-08-28", "descripcion": "Registro de la prueba CP-03", "visibilidad": ["DOCENTE", "APODERADO"]}
    r = session.post(f"{BASE_URL}/documentos", json=body, headers=auth(token), timeout=15)
    check(r.status_code == 201, f"POST /documentos respondió {r.status_code}: {r.text[:200]}")
    created = r.json()
    docs = list_documents(token)
    check(any(d["id"] == created["id"] and d["titulo"] == ACTA_TITLE for d in docs), "El documento creado no aparece en GET /documentos")
    res.resultado_obtenido = f"201 Created (id {created['id']}, folio {created['folio']}); el título aparece en GET /documentos"


def cp04_health(_driver, res: CaseResult) -> None:
    r = session.get(f"{BASE_URL}/health", timeout=10)
    check(r.status_code == 200, f"GET /health respondió {r.status_code}")
    data = r.json()
    check(data.get("status") == "ok", f"status = {data.get('status')!r}")
    res.resultado_obtenido = f"200 OK · status={data['status']} · db={data.get('db')} · instance={data.get('instance')}"


def cp05_control_acceso(_driver, res: CaseResult) -> None:
    director = api_login(USERS["directora"])["token"]
    target = next((d for d in list_documents(director) if d["titulo"] == DIRECTIVE_ONLY_TITLE), None)
    check(target is not None, f"No existe el documento de prueba «{DIRECTIVE_ONLY_TITLE}» (¿se ejecutó el seed?)")
    guardian = api_login(USERS["apoderado2"])["token"]
    visible = [d["id"] for d in list_documents(guardian)]
    check(target["id"] not in visible, "El apoderado ve un documento exclusivo del equipo directivo")
    r = session.get(f"{BASE_URL}/api/v1/documents/{target['id']}/download-url", headers=auth(guardian), timeout=15)
    check(r.status_code == 403, f"download-url respondió {r.status_code} (se esperaba 403)")
    res.resultado_obtenido = f"El documento #{target['id']} no aparece en el listado del apoderado y download-url responde 403"


def cp06_docente(_driver, res: CaseResult) -> None:
    director_docs = list_documents(api_login(USERS["directora"])["token"])
    login = api_login(USERS["docente"])
    docs = list_documents(login["token"])
    titles = {d["titulo"] for d in docs}
    check(DIRECTIVE_ONLY_TITLE not in titles, "El docente ve un documento exclusivo del equipo directivo")
    check(DOCENTE_DIRECTED_TITLE in titles, f"El docente no ve el documento dirigido a él («{DOCENTE_DIRECTED_TITLE}»)")
    for d in docs:
        visibility = d.get("visibilidad") or []
        check("DOCENTE" in visibility or d["titulo"] == DOCENTE_DIRECTED_TITLE,
              f"El docente ve un documento que no es para docentes ni dirigido a él: {d['titulo']}")
    check(len(docs) < len(director_docs), "El docente ve la misma cantidad de documentos que la directora")
    res.resultado_obtenido = f"El docente ve {len(docs)} de {len(director_docs)} documentos: solo los visibles para docentes o dirigidos a él"


def cp07_acuse(_driver, res: CaseResult) -> None:
    director = api_login(USERS["directora"])["token"]
    guardian_login = api_login(USERS["apoderado1"])
    guardian_id = guardian_login["user"]["id"]
    title = f"Citación prueba CP-07 {datetime.now().strftime('%Y%m%d-%H%M%S')}"
    r = session.post(
        f"{BASE_URL}/documentos",
        json={"titulo": title, "tipo": "CITACION", "fecha": datetime.now().strftime("%Y-%m-%d"), "destinatarios": [guardian_id], "requiereAcuse": True},
        headers=auth(director),
        timeout=15,
    )
    check(r.status_code == 201, f"No se pudo crear la citación de prueba ({r.status_code})")
    doc_id = r.json()["id"]
    ack = session.post(f"{BASE_URL}/api/v1/documents/{doc_id}/acknowledge", headers=auth(guardian_login["token"]), timeout=15)
    check(ack.status_code == 200, f"acknowledge respondió {ack.status_code}: {ack.text[:200]}")
    tracking = session.get(f"{BASE_URL}/api/v1/documents/{doc_id}/acknowledgements", headers=auth(director), timeout=15)
    check(tracking.status_code == 200, f"acknowledgements respondió {tracking.status_code}")
    member = next((m for m in tracking.json()["members"] if m["userId"] == guardian_id), None)
    check(member is not None and member["acknowledgedAt"], "El directivo no ve la confirmación de lectura del apoderado")
    res.resultado_obtenido = f"Citación #{doc_id}: el apoderado confirmó y el directivo ve acknowledgedAt={member['acknowledgedAt']}"


def urlpath(url: str) -> str:
    return "/" + url.split("://", 1)[-1].split("/", 1)[-1] if "/" in url.split("://", 1)[-1] else "/"


CASES: list[tuple[CaseResult, Callable]] = [
    (CaseResult("CP-01", "Acceso al sistema", "Selenium abre BASE_URL/ y verifica que carga la pantalla de login (por testID).", "RNF", "Público",
                "La pantalla de login carga con los campos de usuario, contraseña y botón Ingresar"), cp01_acceso),
    (CaseResult("CP-02", "Comunicación frontend–backend", "Login por la interfaz con directora.chorombo, redirección a /panel con el rol visible, y POST /login devuelve token.", "RF2", "DIRECTOR",
                "Redirección a /panel mostrando el rol Director(a); POST /login devuelve un token"), cp02_comunicacion),
    (CaseResult("CP-03", "Persistencia de metadatos", "POST /documentos con «Acta reunión apoderados 08-2026» (ACTA) y luego GET /documentos.", "RF1, RF3", "DIRECTOR",
                "201 Created y el título existe en GET /documentos"), cp03_persistencia),
    (CaseResult("CP-04", "Health check", "GET /health verifica la base de datos con SELECT 1.", "RNF", "Sistema (ALB)",
                "200 OK con status: ok"), cp04_health),
    (CaseResult("CP-05", "Control de acceso", "Un apoderado no ve un documento solo para directivos y download-url le responde 403.", "RF2, RNF", "APODERADO",
                "El documento no aparece en su listado y download-url responde 403"), cp05_control_acceso),
    (CaseResult("CP-06", "Visibilidad del docente", "El docente solo ve documentos visibles para docentes o dirigidos a él.", "RF2", "DOCENTE",
                "No ve documentos exclusivos de directivos y sí el dirigido a él"), cp06_docente),
    (CaseResult("CP-07", "Acuse de recibo", "Un apoderado confirma la lectura de una citación y el directivo lo ve reflejado.", "RF2", "APODERADO / DIRECTOR",
                "El directivo ve la fecha de confirmación del apoderado"), cp07_acuse),
]


# =============================================================================
# Ejecución
# =============================================================================

def run_all() -> list[CaseResult]:
    print(f"Gestor Documental — pruebas funcionales contra {BASE_URL}\n")
    driver = None
    results: list[CaseResult] = []
    try:
        driver = make_driver()
        for res, fn in CASES:
            start = time.perf_counter()
            try:
                fn(driver, res)
                res.estado = "PASS"
            except CaseFailure as exc:
                res.resultado_obtenido = str(exc)
            except Exception as exc:  # noqa: BLE001 - un error inesperado también es un FAIL trazable
                res.resultado_obtenido = f"{type(exc).__name__}: {str(exc)[:300]}"
            res.latencia_ms = round((time.perf_counter() - start) * 1000, 1)
            res.timestamp = datetime.now(timezone.utc).isoformat()
            results.append(res)
            print(f"  [{res.estado}] {res.id} {res.nombre} ({res.latencia_ms:.0f} ms)")
    finally:
        if driver:
            driver.quit()
    return results


def export(results: list[CaseResult]) -> dict:
    passed = sum(r.estado == "PASS" for r in results)
    report = {
        "proyecto": "Gestor Documental — Escuela Básica G-733 Chorombo Bajo",
        "base_url": BASE_URL,
        "ejecutado_en": datetime.now(timezone.utc).isoformat(),
        "resumen": {
            "total": len(results),
            "aprobados": passed,
            "fallidos": len(results) - passed,
            "porcentaje_aprobacion": round(100 * passed / len(results), 1) if results else 0.0,
        },
        "casos": [asdict(r) for r in results],
    }
    RESULTS_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def print_table(results: list[CaseResult], report: dict) -> None:
    widths = (6, 30, 10, 22, 7, 10)
    header = ("ID", "Caso", "Requisito", "Rol", "Estado", "Latencia")
    line = "+" + "+".join("-" * (w + 2) for w in widths) + "+"
    print("\n" + line)
    print("| " + " | ".join(h.ljust(w) for h, w in zip(header, widths)) + " |")
    print(line)
    for r in results:
        row = (r.id, r.nombre[:30], r.requisito[:10], r.rol[:22], r.estado, f"{r.latencia_ms:.0f} ms")
        print("| " + " | ".join(str(v).ljust(w) for v, w in zip(row, widths)) + " |")
    print(line)
    s = report["resumen"]
    print(f"Total: {s['total']} · Aprobados: {s['aprobados']} · Fallidos: {s['fallidos']} · {s['porcentaje_aprobacion']}%")
    print(f"Resultados: {RESULTS_FILE}")
    for r in results:
        if r.estado != "PASS":
            print(f"  {r.id}: {r.resultado_obtenido}")


def main() -> int:
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    results = run_all()
    report = export(results)
    print_table(results, report)
    return 0 if report["resumen"]["fallidos"] == 0 else 1


def test_gestor_documental_cp01_a_cp07() -> None:
    """Punto de entrada para pytest: ejecuta los 7 casos y falla si alguno no pasa."""
    results = run_all()
    report = export(results)
    print_table(results, report)
    assert report["resumen"]["fallidos"] == 0, [r.id for r in results if r.estado != "PASS"]


if __name__ == "__main__":
    sys.exit(main())
