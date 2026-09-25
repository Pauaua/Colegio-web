#!/usr/bin/env python3
"""
Validación del autoescalado del Gestor Documental — Chorombo Bajo.

Modo AWS (por defecto, requiere credenciales):
  - Lee el Auto Scaling Group (mínimo, máximo, deseado y zonas).
  - Verifica la política cpu_target_tracking (TargetTrackingScaling sobre ASGAverageCPUUtilization, objetivo 60%).
  - Lista las Scaling Activities recientes y el HealthyHostCount del Target Group.

Modo --simular (sin credenciales):
  - Lee los valores declarados en terraform/variables.tf y terraform/compute.tf.
  - Contrasta un escenario con CPU promedio de 78,4% y muestra la decisión esperada (scale-out de 2 a 3).

Uso:
  python tests/validar_autoscaling.py --simular
  python tests/validar_autoscaling.py --asg chorombo-bajo-asg [--region us-east-1]

Exporta tests/resultados_autoscaling.json.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TF_DIR = ROOT / "terraform"
RESULTS_FILE = Path(__file__).with_name("resultados_autoscaling.json")

EXPECTED = {"instance_type": "t3.micro", "asg_min": 2, "asg_desired": 2, "asg_max": 4, "cpu_target": 60}
SCENARIO_CPU = 78.4


def check(name: str, expected, actual) -> dict:
    ok = str(expected) == str(actual)
    print(f"  [{'OK' if ok else 'FALLA'}] {name}: esperado={expected} obtenido={actual}")
    return {"verificacion": name, "esperado": expected, "obtenido": actual, "ok": ok}


def tf_variable_default(name: str) -> str | None:
    text = (TF_DIR / "variables.tf").read_text(encoding="utf-8")
    block = re.search(rf'variable\s+"{re.escape(name)}"\s*\{{(.*?)\n\}}', text, re.S)
    if not block:
        return None
    value = re.search(r"^\s*default\s*=\s*(.+?)\s*$", block.group(1), re.M)
    return value.group(1).strip().strip('"') if value else None


def target_tracking_decision(current: int, cpu: float, target: float, minimum: int, maximum: int) -> dict:
    """Fórmula de Target Tracking: capacidad = ceil(capacidad_actual × métrica / objetivo), acotada a [min, max]."""
    raw = current * cpu / target
    desired = max(minimum, min(maximum, math.ceil(raw)))
    if desired > current:
        action = f"SCALE-OUT de {current} a {desired} instancias"
    elif desired < current:
        action = f"SCALE-IN de {current} a {desired} instancias"
    else:
        action = f"Sin cambios ({current} instancias)"
    return {"capacidad_actual": current, "cpu_promedio": cpu, "objetivo": target, "calculo": f"ceil({current} × {cpu} / {target}) = ceil({raw:.3f}) = {math.ceil(raw)}", "capacidad_nueva": desired, "decision": action}


def run_simulation() -> dict:
    print("Modo simulación: valores declarados en Terraform\n")
    compute = (TF_DIR / "compute.tf").read_text(encoding="utf-8")
    declared = {k: tf_variable_default(k) for k in EXPECTED}
    checks = [check(f"variables.tf · {k}", v, declared[k]) for k, v in EXPECTED.items()]

    policy = re.search(r'resource\s+"aws_autoscaling_policy"\s+"cpu_target_tracking"\s*\{(.*?)\n\}', compute, re.S)
    body = policy.group(1) if policy else ""
    checks.append(check("compute.tf · política cpu_target_tracking existe", True, bool(policy)))
    checks.append(check("compute.tf · policy_type", "TargetTrackingScaling", (re.search(r'policy_type\s*=\s*"(\w+)"', body) or [None, None])[1]))
    checks.append(check("compute.tf · métrica", "ASGAverageCPUUtilization", (re.search(r'predefined_metric_type\s*=\s*"(\w+)"', body) or [None, None])[1]))
    checks.append(check("compute.tf · target_value", "var.cpu_target", (re.search(r"target_value\s*=\s*([\w.]+)", body) or [None, None])[1]))
    asg = re.search(r'resource\s+"aws_autoscaling_group"\s+"app"\s*\{(.*?)\n\}', compute, re.S)
    asg_body = asg.group(1) if asg else ""
    checks.append(check("compute.tf · health_check_type", "ELB", (re.search(r'health_check_type\s*=\s*"(\w+)"', asg_body) or [None, None])[1]))
    checks.append(check("compute.tf · subredes en 2 AZ", True, "private_a" in asg_body and "private_b" in asg_body))

    minimum, desired, maximum = int(declared["asg_min"]), int(declared["asg_desired"]), int(declared["asg_max"])
    target = float(declared["cpu_target"])
    print(f"\nEscenario: {desired} instancias con CPU promedio de {SCENARIO_CPU}% (objetivo {target:.0f}%)")
    decision = target_tracking_decision(desired, SCENARIO_CPU, target, minimum, maximum)
    print(f"  Cálculo: {decision['calculo']}")
    print(f"  Decisión esperada: {decision['decision']}")
    print("  La alarma AlarmHigh de target tracking se activa tras ~3 minutos sobre el 60%;")
    print("  la instancia nueva entra al Target Group tras el grace period (120 s) y 2 health checks sanos.")

    escalation = [
        target_tracking_decision(desired, cpu, target, minimum, maximum)
        for cpu in (35.0, 60.0, 78.4, 95.0, 140.0)
    ]
    return {"modo": "simulacion", "valores_declarados": declared, "verificaciones": checks, "escenario": decision, "tabla_decisiones": escalation}


def run_aws(args: argparse.Namespace) -> dict:
    import boto3

    asg_client = boto3.client("autoscaling", region_name=args.region)
    elb = boto3.client("elbv2", region_name=args.region)
    cw = boto3.client("cloudwatch", region_name=args.region)
    print(f"Modo AWS · ASG {args.asg} · {args.region}\n")

    groups = asg_client.describe_auto_scaling_groups(AutoScalingGroupNames=[args.asg])["AutoScalingGroups"]
    if not groups:
        sys.exit(f"No existe el ASG {args.asg}")
    g = groups[0]
    checks = [
        check("ASG · MinSize", EXPECTED["asg_min"], g["MinSize"]),
        check("ASG · MaxSize", EXPECTED["asg_max"], g["MaxSize"]),
        check("ASG · HealthCheckType", "ELB", g["HealthCheckType"]),
        check("ASG · 2 zonas de disponibilidad", 2, len(g["AvailabilityZones"])),
    ]
    print(f"  Capacidad deseada actual: {g['DesiredCapacity']} · zonas: {', '.join(g['AvailabilityZones'])}")

    policies = asg_client.describe_policies(AutoScalingGroupName=args.asg, PolicyTypes=["TargetTrackingScaling"])["ScalingPolicies"]
    policy = next((p for p in policies if "cpu-target-tracking" in p["PolicyName"]), policies[0] if policies else None)
    if policy:
        cfg = policy["TargetTrackingConfiguration"]
        checks.append(check("Política · tipo", "TargetTrackingScaling", policy["PolicyType"]))
        checks.append(check("Política · métrica", "ASGAverageCPUUtilization", cfg["PredefinedMetricSpecification"]["PredefinedMetricType"]))
        checks.append(check("Política · objetivo", float(EXPECTED["cpu_target"]), float(cfg["TargetValue"])))
    else:
        checks.append(check("Política cpu_target_tracking", "existe", "no encontrada"))

    activities = asg_client.describe_scaling_activities(AutoScalingGroupName=args.asg, MaxRecords=10)["Activities"]
    print("\nScaling Activities recientes:")
    for a in activities:
        print(f"  {a['StartTime']:%Y-%m-%d %H:%M:%S} [{a['StatusCode']}] {a['Description']}")

    healthy = None
    tg_arns = g.get("TargetGroupARNs") or []
    if tg_arns:
        tg = tg_arns[0]
        lb_arns = elb.describe_target_groups(TargetGroupArns=[tg])["TargetGroups"][0]["LoadBalancerArns"]
        tg_suffix = tg.split(":")[-1]
        lb_suffix = lb_arns[0].split(":loadbalancer/")[-1] if lb_arns else ""
        end = datetime.now(timezone.utc)
        stats = cw.get_metric_statistics(
            Namespace="AWS/ApplicationELB",
            MetricName="HealthyHostCount",
            Dimensions=[{"Name": "TargetGroup", "Value": tg_suffix}, {"Name": "LoadBalancer", "Value": lb_suffix}],
            StartTime=end - timedelta(minutes=10),
            EndTime=end,
            Period=60,
            Statistics=["Maximum"],
        )["Datapoints"]
        healthy = max((d["Maximum"] for d in stats), default=None)
        states = [d["TargetHealth"]["State"] for d in elb.describe_target_health(TargetGroupArn=tg)["TargetHealthDescriptions"]]
        print(f"\nHealthyHostCount (máx. últimos 10 min): {healthy} · estados actuales: {states}")

    return {
        "modo": "aws",
        "region": args.region,
        "asg": {"nombre": g["AutoScalingGroupName"], "min": g["MinSize"], "max": g["MaxSize"], "deseado": g["DesiredCapacity"], "zonas": g["AvailabilityZones"],
                "instancias": [{"id": i["InstanceId"], "az": i["AvailabilityZone"], "estado": i["LifecycleState"], "salud": i["HealthStatus"]} for i in g["Instances"]]},
        "politica": policy and {"nombre": policy["PolicyName"], "tipo": policy["PolicyType"], "objetivo": policy["TargetTrackingConfiguration"]["TargetValue"]},
        "healthy_host_count": healthy,
        "actividades_escalado": [{"inicio": a["StartTime"].isoformat(), "estado": a["StatusCode"], "descripcion": a["Description"], "causa": a.get("Cause")} for a in activities],
        "verificaciones": checks,
    }


def main() -> int:
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--simular", action="store_true", help="sin credenciales: contrasta Terraform con un escenario de CPU al 78,4%%")
    parser.add_argument("--asg", default=os.environ.get("ASG_NAME", "chorombo-bajo-asg"))
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"))
    args = parser.parse_args()

    result = run_simulation() if args.simular else run_aws(args)
    ok = all(c["ok"] for c in result["verificaciones"])
    report = {"proyecto": "Gestor Documental — Escuela Básica G-733 Chorombo Bajo", "ejecutado_en": datetime.now(timezone.utc).isoformat(),
              "resultado": "APROBADO" if ok else "CON OBSERVACIONES", **result}
    RESULTS_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(f"\nResultado: {report['resultado']} · {RESULTS_FILE}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
