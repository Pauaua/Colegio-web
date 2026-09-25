#!/usr/bin/env python3
"""
Simulación de contingencia (tolerancia a fallos) del Gestor Documental — Chorombo Bajo.

Sondea BASE_URL/health cada 1 segundo y registra con timestamp las tres fases:
    Fase 1: HEALTHY                -> el servicio responde normalmente
    Fase 2: UNHEALTHY DETECTADO    -> cae una instancia y el balanceador la detecta
    Fase 3: HEALTHY restablecido   -> la capacidad se recupera automáticamente
Calcula el tiempo de interrupción percibida (segundos con sondeos fallidos) y el tiempo de recuperación.
Criterios de éxito: interrupción percibida <= 5 s y recuperación automática <= 5 min.

Modos:
  --modo local  (por defecto) Reproduce la arquitectura en el equipo: 2 réplicas del backend detrás de
                un balanceador local en el puerto de BASE_URL que hace health check cada 1 s y retira una
                réplica tras 2 fallos (igual que el Target Group). Detiene la réplica "us-east-1a" y,
                pasado --caida segundos, lanza un reemplazo (como el ASG).
                Con --replicas 1 se detiene y reinicia el único proceso (sin redundancia).
  --modo aws    Termina una instancia real del ASG en us-east-1a con boto3, muestra cómo el ALB la saca
                del Target Group y cómo el ASG lanza el reemplazo.

Ejemplos:
  python tests/simular_contingencia.py --modo local
  python tests/simular_contingencia.py --modo local --comando "node backend/dist/src/server.js"
  BASE_URL=http://<dns-del-alb> python tests/simular_contingencia.py --modo aws --asg chorombo-bajo-asg

Exporta tests/resultados_contingencia.json.
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import shlex
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import requests

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/")
ROOT = Path(__file__).resolve().parent.parent
RESULTS_FILE = Path(__file__).with_name("resultados_contingencia.json")
MAX_INTERRUPTION_S = 5
MAX_RECOVERY_S = 300


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(t: datetime) -> str:
    return t.isoformat(timespec="milliseconds")


def local_time(t: datetime) -> str:
    return t.astimezone().strftime("%H:%M:%S")


class Timeline:
    """Registro ordenado de sondeos y eventos."""

    def __init__(self) -> None:
        self.events: list[dict] = []
        self.probes: list[dict] = []
        self.lock = threading.Lock()

    def event(self, phase: str, detail: str, **extra) -> dict:
        t = now()
        entry = {"timestamp": iso(t), "fase": phase, "detalle": detail, **extra}
        with self.lock:
            self.events.append(entry)
        print(f"[{local_time(t)}] {phase:<22} {detail}", flush=True)
        return entry

    def probe(self, url: str) -> dict:
        t = now()
        start = time.perf_counter()
        try:
            r = requests.get(url, timeout=2)
            ok = r.status_code == 200 and r.json().get("status") == "ok"
            result = {"timestamp": iso(t), "ok": ok, "http": r.status_code, "instance": r.json().get("instance") if r.headers.get("content-type", "").startswith("application/json") else None}
        except (requests.RequestException, ValueError) as exc:
            result = {"timestamp": iso(t), "ok": False, "http": None, "error": type(exc).__name__}
        result["latencia_ms"] = round((time.perf_counter() - start) * 1000, 1)
        result["fin"] = iso(now())
        with self.lock:
            self.probes.append(result)
        mark = "OK " if result["ok"] else "ERR"
        print(f"    sondeo {local_time(t)} {mark} http={result.get('http')} instancia={result.get('instance', '-')} {result['latencia_ms']:.0f} ms", flush=True)
        return result


def probe_for(timeline: Timeline, seconds: float, stop: threading.Event | None = None) -> None:
    """Sondea /health cada 1 segundo durante `seconds`."""
    end = time.monotonic() + seconds
    while time.monotonic() < end and not (stop and stop.is_set()):
        tick = time.monotonic()
        timeline.probe(f"{BASE_URL}/health")
        time.sleep(max(0.0, 1.0 - (time.monotonic() - tick)))


def perceived_interruption(probes: list[dict]) -> float:
    """Suma de los tramos sin servicio: desde que un sondeo falla hasta que el siguiente responde bien."""
    total, down_since = 0.0, None
    for p in probes:
        if not p["ok"] and down_since is None:
            down_since = datetime.fromisoformat(p["timestamp"])
        elif p["ok"] and down_since is not None:
            # El servicio vuelve cuando LLEGA la primera respuesta correcta.
            total += (datetime.fromisoformat(p.get("fin", p["timestamp"])) - down_since).total_seconds()
            down_since = None
    if down_since is not None and probes:
        total += (datetime.fromisoformat(probes[-1]["timestamp"]) - down_since).total_seconds() + 1
    return round(total, 1)


def summarize(timeline: Timeline, failure_at: datetime | None, recovered_at: datetime | None) -> dict:
    failed = [p for p in timeline.probes if not p["ok"]]
    interruption = perceived_interruption(timeline.probes)
    recovery = (recovered_at - failure_at).total_seconds() if failure_at and recovered_at else None
    return {
        "sondeos_totales": len(timeline.probes),
        "sondeos_fallidos": len(failed),
        "interrupcion_percibida_s": interruption,
        "tiempo_recuperacion_s": round(recovery, 1) if recovery is not None else None,
        "criterio_interrupcion_ok": interruption <= MAX_INTERRUPTION_S,
        "criterio_recuperacion_ok": recovery is not None and recovery <= MAX_RECOVERY_S,
        "primer_fallo": failed[0]["timestamp"] if failed else None,
        "ultimo_fallo": failed[-1]["timestamp"] if failed else None,
    }


# =============================================================================
# Modo local: réplicas + balanceador con health check (simula ALB + ASG)
# =============================================================================

def port_open(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex((host, port)) == 0


class Replica:
    def __init__(self, name: str, port: int, command: list[str], env: dict) -> None:
        self.name, self.port, self.command, self.env = name, port, command, env
        self.proc: subprocess.Popen | None = None

    def start(self) -> None:
        env = {**os.environ, **self.env, "PORT": str(self.port), "INSTANCE_ID": self.name}
        self.proc = subprocess.Popen(self.command, cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def wait_ready(self, timeout: float = 60) -> bool:
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            try:
                if requests.get(f"http://127.0.0.1:{self.port}/health", timeout=1).status_code == 200:
                    return True
            except requests.RequestException:
                pass
            time.sleep(0.3)
        return False

    def kill(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.kill()  # caída abrupta, como una instancia que se apaga
            self.proc.wait(timeout=10)


class LocalBalancer:
    """Balanceador round-robin con health check (interval 1 s, 2 checks sanos / 2 no sanos), como el Target Group."""

    def __init__(self, port: int, replicas: list[Replica], timeline: Timeline) -> None:
        self.port, self.replicas, self.timeline = port, replicas, timeline
        self.healthy: dict[str, bool] = {r.name: True for r in replicas}
        self.streak: dict[str, int] = {r.name: 0 for r in replicas}
        self.rr = 0
        self.stop = threading.Event()
        self.on_change = None
        balancer = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args) -> None:
                pass

            def _forward(self) -> None:
                target = balancer.pick()
                if target is None:
                    self._reply(503, b'{"error":"NO_HEALTHY_TARGETS"}')
                    return
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length) if length else None
                try:
                    # Timeout de conexión corto: un destino caído da 502 rápido, como en un ALB. (En Windows una
                    # conexión local a un puerto cerrado no se rechaza al instante sino que agota el timeout.)
                    conn = http.client.HTTPConnection("127.0.0.1", target.port, timeout=0.3)
                    conn.connect()
                    conn.sock.settimeout(10)
                    headers = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "connection")}
                    conn.request(self.command, self.path, body=body, headers=headers)
                    resp = conn.getresponse()
                    data = resp.read()
                    self.send_response(resp.status)
                    for k, v in resp.getheaders():
                        if k.lower() not in ("transfer-encoding", "connection", "content-length"):
                            self.send_header(k, v)
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                except OSError:
                    # Igual que un ALB: si el destino no responde, el cliente recibe 502.
                    self._reply(502, b'{"error":"BAD_GATEWAY"}')

            def _reply(self, status: int, body: bytes) -> None:
                try:
                    self.send_response(status)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                except OSError:
                    pass  # el cliente ya cerró la conexión

            do_GET = do_POST = do_PATCH = do_DELETE = _forward  # noqa: N815

        class QuietServer(ThreadingHTTPServer):
            daemon_threads = True

            def handle_error(self, request, client_address) -> None:  # noqa: ANN001 - firma de socketserver
                pass  # conexiones cortadas durante la caída simulada: se reflejan en los sondeos, no en trazas

        self.server = QuietServer(("127.0.0.1", port), Handler)

    def pick(self) -> Replica | None:
        alive = [r for r in self.replicas if self.healthy.get(r.name)]
        if not alive:
            return None
        self.rr = (self.rr + 1) % len(alive)
        return alive[self.rr]

    def replace(self, old: Replica, new: Replica) -> None:
        idx = self.replicas.index(old)
        self.replicas[idx] = new
        self.healthy.pop(old.name, None)
        self.streak.pop(old.name, None)
        self.healthy[new.name] = False  # entra como "initial" hasta pasar 2 checks
        self.streak[new.name] = 0

    def _health_loop(self) -> None:
        while not self.stop.is_set():
            for r in list(self.replicas):
                try:
                    ok = requests.get(f"http://127.0.0.1:{r.port}/health", timeout=1).status_code == 200
                except requests.RequestException:
                    ok = False
                was = self.healthy.get(r.name, False)
                self.streak[r.name] = self.streak.get(r.name, 0) + 1 if ok != was else 0
                if self.streak[r.name] >= 2:  # healthy_threshold = unhealthy_threshold = 2
                    self.healthy[r.name] = ok
                    self.streak[r.name] = 0
                    if self.on_change:
                        self.on_change(r, ok)
            time.sleep(1)

    def start(self) -> None:
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        threading.Thread(target=self._health_loop, daemon=True).start()

    def shutdown(self) -> None:
        self.stop.set()
        self.server.shutdown()
        self.server.server_close()


def run_local(args: argparse.Namespace) -> dict:
    parsed = urlparse(BASE_URL)
    port = parsed.port or 80
    if parsed.hostname not in ("localhost", "127.0.0.1"):
        sys.exit("El modo local necesita BASE_URL en localhost.")
    if port_open(port):
        sys.exit(f"El puerto {port} está en uso: detenga el servidor que lo ocupa (el script levanta su propio entorno).")

    command = shlex.split(args.comando, posix=os.name != "nt") if args.comando else [sys.executable, "ansible/files/app_referencia.py"]
    shared_env = {"SQLITE_PATH": str(Path(__file__).with_name(".contingencia.db"))}
    timeline = Timeline()
    zones = ["us-east-1a", "us-east-1b"]
    next_port = port + 1
    replicas: list[Replica] = []
    balancer: LocalBalancer | None = None
    failure_at = recovered_at = None
    detected = threading.Event()
    restored = threading.Event()

    try:
        if args.replicas == 1:
            replicas.append(Replica("instancia-us-east-1a", port, command, shared_env))
        else:
            for i in range(args.replicas):
                replicas.append(Replica(f"instancia-{zones[i % 2]}-{i + 1}", next_port + i, command, shared_env))
        # En secuencia: la primera réplica crea la base compartida (como RDS) y las demás la reutilizan.
        for r in replicas:
            r.start()
            if not r.wait_ready():
                raise RuntimeError(f"{r.name} no respondió /health a tiempo")

        if args.replicas > 1:
            balancer = LocalBalancer(port, replicas, timeline)

            def on_change(replica: Replica, ok: bool) -> None:
                nonlocal recovered_at
                if not ok and not detected.is_set():
                    timeline.event("Fase 2: UNHEALTHY", f"El balanceador retira {replica.name} tras 2 health checks fallidos", instancia=replica.name)
                    detected.set()
                elif ok and detected.is_set() and not restored.is_set():
                    recovered_at = now()
                    timeline.event("Fase 3: HEALTHY", f"{replica.name} pasa 2 health checks y vuelve al balanceo: capacidad restablecida", instancia=replica.name)
                    restored.set()

            balancer.on_change = on_change
            balancer.start()

        timeline.event("Fase 1: HEALTHY", f"{len(replicas)} réplica(s) en servicio detrás de {BASE_URL}")
        probe_for(timeline, args.observar)

        victim = replicas[0]
        failure_at = now()
        timeline.event("FALLA INYECTADA", f"Se detiene abruptamente {victim.name} (puerto {victim.port})", instancia=victim.name)
        victim.kill()

        if args.replicas == 1:
            # Sin redundancia: la caída se percibe hasta que el servicio reinicia (systemd Restart=always).
            stop = threading.Event()
            watcher = threading.Thread(target=probe_for, args=(timeline, args.caida + 60, stop), daemon=True)
            watcher.start()
            time.sleep(1.5)
            timeline.event("Fase 2: UNHEALTHY", "El servicio no responde /health")
            time.sleep(max(0, args.caida - 1.5))
            victim.start()
            victim.wait_ready()
            recovered_at = now()
            timeline.event("Fase 3: HEALTHY", "El proceso se reinició y /health vuelve a responder 200")
            time.sleep(3)
            stop.set()
            watcher.join()
        else:
            # Con redundancia: el balanceador saca la réplica caída y el ASG lanza un reemplazo.
            stop = threading.Event()
            watcher = threading.Thread(target=probe_for, args=(timeline, args.caida + 120, stop), daemon=True)
            watcher.start()
            time.sleep(args.caida)
            replacement = Replica(f"{victim.name}-reemplazo", victim.port, command, shared_env)
            timeline.event("REEMPLAZO", f"Se lanza {replacement.name} (equivalente a la nueva instancia del ASG)")
            replacement.start()
            assert balancer is not None
            balancer.replace(victim, replacement)
            replicas[0] = replacement
            restored.wait(timeout=120)
            time.sleep(3)
            stop.set()
            watcher.join()

        return {"modo": "local", "replicas": args.replicas, "comando": " ".join(command), **finish(timeline, failure_at, recovered_at)}
    finally:
        if balancer:
            balancer.shutdown()
        for r in replicas:
            r.kill()
        time.sleep(0.5)  # en Windows el archivo queda bloqueado un instante tras terminar el proceso
        for suffix in ("", "-wal", "-shm"):
            try:
                Path(str(shared_env["SQLITE_PATH"]) + suffix).unlink(missing_ok=True)
            except OSError:
                pass


# =============================================================================
# Modo AWS: terminar una instancia real del ASG
# =============================================================================

def run_aws(args: argparse.Namespace) -> dict:
    import boto3

    region = args.region
    asg_client = boto3.client("autoscaling", region_name=region)
    elb = boto3.client("elbv2", region_name=region)
    timeline = Timeline()

    def describe_asg() -> dict:
        groups = asg_client.describe_auto_scaling_groups(AutoScalingGroupNames=[args.asg])["AutoScalingGroups"]
        if not groups:
            sys.exit(f"No existe el ASG {args.asg} en {region}")
        return groups[0]

    def print_instances(group: dict) -> list[dict]:
        rows = [{"id": i["InstanceId"], "az": i["AvailabilityZone"], "estado": i["LifecycleState"], "salud": i["HealthStatus"]} for i in group["Instances"]]
        for r in rows:
            print(f"      {r['id']}  {r['az']}  {r['estado']:<12} {r['salud']}")
        return rows

    def target_health(tg_arn: str) -> dict[str, str]:
        descs = elb.describe_target_health(TargetGroupArn=tg_arn)["TargetHealthDescriptions"]
        return {d["Target"]["Id"]: d["TargetHealth"]["State"] for d in descs}

    group = describe_asg()
    tg_arn = args.target_group or (group.get("TargetGroupARNs") or [None])[0]
    if not tg_arn:
        sys.exit("El ASG no tiene Target Group asociado (use --target-group)")
    print(f"ASG {args.asg}: min={group['MinSize']} deseado={group['DesiredCapacity']} max={group['MaxSize']}")
    before = print_instances(group)
    victims = [i for i in group["Instances"] if i["AvailabilityZone"] == args.az and i["LifecycleState"] == "InService"]
    if not victims:
        sys.exit(f"No hay instancias InService en {args.az}")
    victim = victims[0]["InstanceId"]
    initial_ids = {i["InstanceId"] for i in group["Instances"]}

    timeline.event("Fase 1: HEALTHY", f"{len(before)} instancias en el ASG; Target Group: {target_health(tg_arn)}")
    probe_for(timeline, args.observar)

    failure_at = now()
    asg_client.terminate_instance_in_auto_scaling_group(InstanceId=victim, ShouldDecrementDesiredCapacity=False)
    timeline.event("FALLA INYECTADA", f"terminate-instance-in-auto-scaling-group {victim} ({args.az})", instancia=victim)

    detected = False
    recovered_at = None
    deadline = time.monotonic() + args.timeout
    last_check = 0.0
    snapshots = []
    while time.monotonic() < deadline:
        tick = time.monotonic()
        timeline.probe(f"{BASE_URL}/health")
        if tick - last_check >= 5:
            last_check = tick
            states = target_health(tg_arn)
            group = describe_asg()
            snapshots.append({"timestamp": iso(now()), "target_group": states, "asg": [(i["InstanceId"], i["LifecycleState"]) for i in group["Instances"]]})
            if not detected and states.get(victim) in ("draining", "unhealthy", None):
                detected = True
                timeline.event("Fase 2: UNHEALTHY", f"El ALB saca {victim} del Target Group (estado: {states.get(victim, 'desregistrada')})", instancia=victim)
            new_healthy = [iid for iid, st in states.items() if iid not in initial_ids and st == "healthy"]
            if detected and new_healthy and sum(1 for st in states.values() if st == "healthy") >= group["DesiredCapacity"]:
                recovered_at = now()
                timeline.event("Fase 3: HEALTHY", f"El ASG lanzó {new_healthy[0]} y ya está healthy en el Target Group", instancia=new_healthy[0])
                print_instances(group)
                break
        time.sleep(max(0.0, 1.0 - (time.monotonic() - tick)))

    activities = asg_client.describe_scaling_activities(AutoScalingGroupName=args.asg, MaxRecords=5)["Activities"]
    return {
        "modo": "aws",
        "region": region,
        "asg": args.asg,
        "instancia_terminada": victim,
        "instancias_iniciales": before,
        "instancias_finales": [{"id": i["InstanceId"], "az": i["AvailabilityZone"], "estado": i["LifecycleState"]} for i in describe_asg()["Instances"]],
        "actividades_escalado": [{"inicio": a["StartTime"].isoformat(), "estado": a["StatusCode"], "descripcion": a["Description"]} for a in activities],
        "estados_target_group": snapshots,
        **finish(timeline, failure_at, recovered_at),
    }


def finish(timeline: Timeline, failure_at, recovered_at) -> dict:
    summary = summarize(timeline, failure_at, recovered_at)
    return {"resumen": summary, "eventos": timeline.events, "sondeos": timeline.probes}


def main() -> int:
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--modo", choices=["local", "aws"], default="local")
    parser.add_argument("--observar", type=float, default=5, help="segundos de observación en Fase 1 (por defecto 5)")
    parser.add_argument("--caida", type=float, default=10, help="local: segundos hasta lanzar el reemplazo / reinicio (por defecto 10)")
    parser.add_argument("--replicas", type=int, default=2, help="local: réplicas detrás del balanceador (por defecto 2)")
    parser.add_argument("--comando", help='local: comando del backend (por defecto "python ansible/files/app_referencia.py")')
    parser.add_argument("--asg", help="aws: nombre del Auto Scaling Group")
    parser.add_argument("--az", default="us-east-1a", help="aws: zona de la instancia a terminar")
    parser.add_argument("--target-group", help="aws: ARN del Target Group (por defecto, el del ASG)")
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"))
    parser.add_argument("--timeout", type=float, default=600, help="aws: tiempo máximo de espera de la recuperación (s)")
    args = parser.parse_args()

    print(f"Simulación de contingencia · modo {args.modo} · BASE_URL={BASE_URL}\n")
    if args.modo == "aws":
        if not args.asg:
            parser.error("--modo aws requiere --asg <nombre>")
        result = run_aws(args)
    else:
        result = run_local(args)

    report = {"proyecto": "Gestor Documental — Escuela Básica G-733 Chorombo Bajo", "base_url": BASE_URL, "ejecutado_en": iso(now()),
              "criterios": {"interrupcion_percibida_max_s": MAX_INTERRUPTION_S, "recuperacion_max_s": MAX_RECOVERY_S}, **result}
    RESULTS_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    s = result["resumen"]
    print("\n== Resumen ==")
    print(f"Interrupción percibida: {s['interrupcion_percibida_s']:.1f} s ({s['sondeos_fallidos']} de {s['sondeos_totales']} sondeos fallidos) "
          f"-> {'CUMPLE' if s['criterio_interrupcion_ok'] else 'NO CUMPLE'} (<= {MAX_INTERRUPTION_S} s)")
    print(f"Tiempo de recuperación: {s['tiempo_recuperacion_s']} s -> {'CUMPLE' if s['criterio_recuperacion_ok'] else 'NO CUMPLE'} (<= {MAX_RECOVERY_S} s)")
    print(f"Resultados: {RESULTS_FILE}")
    return 0 if s["criterio_interrupcion_ok"] and s["criterio_recuperacion_ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
