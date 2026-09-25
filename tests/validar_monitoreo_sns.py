#!/usr/bin/env python3
"""
Validación del monitoreo (CloudWatch + SNS) del Gestor Documental — Chorombo Bajo.

Modo AWS (por defecto, requiere credenciales):
  - Verifica que existan exactamente las 3 alarmas con sus umbrales, periodos y acciones hacia SNS.
  - Verifica que el tópico SNS tenga la suscripción de correo CONFIRMADA.
  - --disparar: pone cpu-alta y hosts-no-saludables en ALARM con set_alarm_state para comprobar
    la llegada del correo, espera y luego las devuelve a OK.

Modo --simular (sin credenciales):
  - Verifica en terraform/monitoring.tf las 3 alarmas, sus umbrales exactos, las acciones hacia SNS,
    la suscripción por email y el dashboard de 4 paneles.

Uso:
  python tests/validar_monitoreo_sns.py --simular
  python tests/validar_monitoreo_sns.py [--topic-arn arn:aws:sns:...] [--disparar] [--espera 60]

Exporta tests/resultados_monitoreo.json.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TF_FILE = ROOT / "terraform" / "monitoring.tf"
RESULTS_FILE = Path(__file__).with_name("resultados_monitoreo.json")

# Alarmas exigidas por el documento técnico.
EXPECTED_ALARMS = {
    "cpu-alta": {"metric": "CPUUtilization", "namespace": "AWS/EC2", "threshold": 70.0, "period": 60, "evaluation_periods": 3,
                 "justificacion": "10 puntos sobre el objetivo de escalado (60%): avisa si el autoescalado no alcanza a reaccionar"},
    "hosts-no-saludables": {"metric": "UnHealthyHostCount", "namespace": "AWS/ApplicationELB", "threshold": 0.0, "period": 60, "evaluation_periods": 1,
                            "justificacion": "cualquier host no saludable es capacidad perdida"},
    "db-conexiones-altas": {"metric": "DatabaseConnections", "namespace": "AWS/RDS", "threshold": 40.0, "period": 60, "evaluation_periods": 3,
                            "justificacion": "alerta temprana antes del límite de conexiones de db.t3.micro"},
}
TRIGGER = ["cpu-alta", "hosts-no-saludables"]


def check(name: str, expected, actual) -> dict:
    ok = expected == actual
    print(f"  [{'OK' if ok else 'FALLA'}] {name}: esperado={expected} obtenido={actual}")
    return {"verificacion": name, "esperado": expected, "obtenido": actual, "ok": ok}


def run_simulation() -> dict:
    print(f"Modo simulación: {TF_FILE.relative_to(ROOT)}\n")
    text = TF_FILE.read_text(encoding="utf-8")
    checks: list[dict] = []
    blocks = re.findall(r'resource\s+"aws_cloudwatch_metric_alarm"\s+"(\w+)"\s*\{(.*?)\n\}', text, re.S)
    alarms = {}
    for resource, body in blocks:
        def attr(key: str, _body: str = body) -> str | None:
            m = re.search(rf'^\s*{key}\s*=\s*"?([^"\n]+?)"?\s*$', _body, re.M)
            return m.group(1).strip() if m else None
        alarms[attr("alarm_name")] = {"recurso": resource, "metric": attr("metric_name"), "namespace": attr("namespace"),
                                      "threshold": float(attr("threshold") or "nan"), "period": int(attr("period") or 0),
                                      "evaluation_periods": int(attr("evaluation_periods") or 0), "comparison": attr("comparison_operator"),
                                      "alarm_actions": "aws_sns_topic.alerts.arn" in (re.search(r"alarm_actions\s*=\s*\[(.*?)\]", body, re.S) or [None, ""])[1],
                                      "ok_actions": "aws_sns_topic.alerts.arn" in (re.search(r"ok_actions\s*=\s*\[(.*?)\]", body, re.S) or [None, ""])[1]}

    checks.append(check("Cantidad de alarmas", 3, len(alarms)))
    for name, exp in EXPECTED_ALARMS.items():
        got = alarms.get(name)
        print(f"\n  Alarma {name} ({exp['justificacion']})")
        if not got:
            checks.append(check(f"{name} · existe", True, False))
            continue
        for key in ("metric", "namespace", "threshold", "period", "evaluation_periods"):
            checks.append(check(f"{name} · {key}", exp[key], got[key]))
        checks.append(check(f"{name} · comparación", "GreaterThanThreshold", got["comparison"]))
        checks.append(check(f"{name} · alarm_actions → SNS", True, got["alarm_actions"]))
        checks.append(check(f"{name} · ok_actions → SNS", True, got["ok_actions"]))
    checks.append(check("hosts-no-saludables · recurso aws_cloudwatch_metric_alarm.hosts_unhealthy", "hosts_unhealthy", (alarms.get("hosts-no-saludables") or {}).get("recurso")))

    print()
    checks.append(check("Tópico SNS aws_sns_topic.alerts", True, bool(re.search(r'resource\s+"aws_sns_topic"\s+"alerts"', text))))
    checks.append(check("Suscripción por email a var.alert_email", True, bool(re.search(r'protocol\s*=\s*"email"', text) and "var.alert_email" in text)))
    dashboard = re.search(r'dashboard_name\s*=\s*local\.dashboard_name', text) and re.search(r'dashboard_name\s*=\s*"chorombo-bajo-gestor-documental"', text)
    checks.append(check("Dashboard chorombo-bajo-gestor-documental", True, bool(dashboard)))
    widgets = len(re.findall(r'type\s*=\s*"metric"', text))
    checks.append(check("Dashboard · paneles", 4, widgets))
    log_group = re.search(r'name\s*=\s*"/chorombo/gestor-documental"', text)
    checks.append(check("Log group /chorombo/gestor-documental (14 días)", True, bool(log_group)))

    print("\nCon credenciales AWS, --disparar pone cpu-alta y hosts-no-saludables en ALARM (llega un correo por")
    print("cada una) y luego las devuelve a OK (llega el correo de recuperación, porque ok_actions también notifica).")
    return {"modo": "simulacion", "alarmas_declaradas": alarms, "verificaciones": checks}


def run_aws(args: argparse.Namespace) -> dict:
    import boto3

    cw = boto3.client("cloudwatch", region_name=args.region)
    sns = boto3.client("sns", region_name=args.region)
    print(f"Modo AWS · {args.region}\n")
    checks: list[dict] = []

    found = {a["AlarmName"]: a for a in cw.describe_alarms(AlarmNames=list(EXPECTED_ALARMS))["MetricAlarms"]}
    checks.append(check("Alarmas encontradas", 3, len(found)))
    topic_arns = set()
    for name, exp in EXPECTED_ALARMS.items():
        a = found.get(name)
        print(f"\n  Alarma {name} ({exp['justificacion']})")
        if not a:
            checks.append(check(f"{name} · existe", True, False))
            continue
        checks.append(check(f"{name} · métrica", exp["metric"], a["MetricName"]))
        checks.append(check(f"{name} · umbral", exp["threshold"], float(a["Threshold"])))
        checks.append(check(f"{name} · periodo", exp["period"], a["Period"]))
        checks.append(check(f"{name} · evaluation_periods", exp["evaluation_periods"], a["EvaluationPeriods"]))
        checks.append(check(f"{name} · comparación", "GreaterThanThreshold", a["ComparisonOperator"]))
        checks.append(check(f"{name} · acciones ALARM y OK hacia SNS", True, bool(a["AlarmActions"]) and bool(a["OKActions"])))
        print(f"      estado actual: {a['StateValue']}")
        topic_arns.update(x for x in a["AlarmActions"] if ":sns:" in x)

    topic = args.topic_arn or next(iter(topic_arns), None)
    subscriptions = []
    if topic:
        subscriptions = sns.list_subscriptions_by_topic(TopicArn=topic)["Subscriptions"]
        confirmed = [s for s in subscriptions if s["Protocol"] == "email" and s["SubscriptionArn"].startswith("arn:")]
        print(f"\n  Tópico {topic}")
        for s in subscriptions:
            state = "confirmada" if s["SubscriptionArn"].startswith("arn:") else "PENDIENTE de confirmar"
            print(f"      {s['Protocol']} {s['Endpoint']}: {state}")
        checks.append(check("SNS · suscripción email confirmada", True, bool(confirmed)))
    else:
        checks.append(check("SNS · tópico asociado a las alarmas", True, False))

    triggered = []
    if args.disparar:
        print(f"\nDisparando {', '.join(TRIGGER)} (set_alarm_state → ALARM)…")
        for name in TRIGGER:
            cw.set_alarm_state(AlarmName=name, StateValue="ALARM", StateReason="Prueba de notificación SNS (validar_monitoreo_sns.py)")
            triggered.append({"alarma": name, "estado": "ALARM", "timestamp": datetime.now(timezone.utc).isoformat()})
        print(f"Revise el correo: deben llegar {len(TRIGGER)} alertas. Esperando {args.espera} s…")
        time.sleep(args.espera)
        for name in TRIGGER:
            cw.set_alarm_state(AlarmName=name, StateValue="OK", StateReason="Fin de la prueba de notificación SNS")
            triggered.append({"alarma": name, "estado": "OK", "timestamp": datetime.now(timezone.utc).isoformat()})
        print("Alarmas devueltas a OK (llega también el correo de recuperación).")
        history = cw.describe_alarm_history(AlarmName=TRIGGER[0], HistoryItemType="Action", MaxRecords=5)["AlarmHistoryItems"]
        triggered.append({"historial_acciones_cpu_alta": [h["HistorySummary"] for h in history]})

    return {
        "modo": "aws",
        "region": args.region,
        "alarmas": {n: {"estado": a["StateValue"], "umbral": a["Threshold"], "periodo": a["Period"], "evaluation_periods": a["EvaluationPeriods"]} for n, a in found.items()},
        "topico_sns": topic,
        "suscripciones": [{"protocolo": s["Protocol"], "endpoint": s["Endpoint"], "confirmada": s["SubscriptionArn"].startswith("arn:")} for s in subscriptions],
        "disparo": triggered,
        "verificaciones": checks,
    }


def main() -> int:
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--simular", action="store_true", help="sin credenciales: verifica terraform/monitoring.tf")
    parser.add_argument("--disparar", action="store_true", help="pone cpu-alta y hosts-no-saludables en ALARM y luego en OK")
    parser.add_argument("--espera", type=int, default=60, help="segundos en ALARM antes de volver a OK (por defecto 60)")
    parser.add_argument("--topic-arn", default=os.environ.get("SNS_TOPIC_ARN"))
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"))
    args = parser.parse_args()

    result = run_simulation() if args.simular else run_aws(args)
    ok = all(c["ok"] for c in result["verificaciones"])
    report = {"proyecto": "Gestor Documental — Escuela Básica G-733 Chorombo Bajo", "ejecutado_en": datetime.now(timezone.utc).isoformat(),
              "resultado": "APROBADO" if ok else "CON OBSERVACIONES", **result}
    RESULTS_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    passed = sum(c["ok"] for c in result["verificaciones"])
    print(f"\nResultado: {report['resultado']} ({passed}/{len(result['verificaciones'])} verificaciones) · {RESULTS_FILE}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
