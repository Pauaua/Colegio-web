# Bitácora de prueba de tolerancia a fallos

**Gestor Documental — Escuela Básica G-733 Chorombo Bajo (María Pinto)**

| Campo | Valor |
|---|---|
| Sistema | Gestor Documental (API Node.js + app web) en AWS us-east-1 |
| Requisito | RNF Disponibilidad: el sistema sigue operativo ante la caída de una instancia o de una Zona de Disponibilidad |
| Responsable | _(completar)_ |
| Fecha de ejecución | _(completar)_ |
| Versión del artefacto | _(contenido de `/opt/gestor-documental/VERSION`)_ |

---

## 1. Objetivo

Demostrar que la plataforma tolera sin intervención manual:

1. **La caída de una instancia EC2** del Auto Scaling Group (ASG): el ALB deja de enviarle tráfico y el ASG lanza un reemplazo.
2. **La caída de la base de datos primaria**: el failover de Amazon RDS Multi-AZ promueve la réplica en espera de la otra zona.

Se miden la **interrupción percibida** por los usuarios y el **tiempo de recuperación automática**.

## 2. Alcance

| Incluido | Excluido |
|---|---|
| Terminar 1 instancia del ASG en `us-east-1a` | Caída de la región completa |
| Failover forzado de RDS (`--force-failover`) | Pérdida del bucket S3 (durabilidad 11 nueves, versionado) |
| Verificación de alertas SNS (`hosts-no-saludables`) | Pruebas de carga (ver `prueba_carga_cyberday.jmx`) |

## 3. Precondiciones

- [ ] `terraform apply` completado y `terraform output` disponible (ALB, ASG, Target Group, SNS, RDS).
- [ ] Artefacto desplegado con Ansible: `http://<alb_dns_name>/health` responde `200 {"status":"ok"}`.
- [ ] El ASG tiene **2 instancias InService**, una en `us-east-1a` y otra en `us-east-1b`.
- [ ] El Target Group muestra **2 targets `healthy`**.
- [ ] Suscripción de correo a SNS **confirmada** (`python tests/validar_monitoreo_sns.py`).
- [ ] RDS en estado `available` con `MultiAZ = true`.
- [ ] Consola de CloudWatch abierta en el dashboard `chorombo-bajo-gestor-documental`.

Variables usadas en los comandos:

```bash
export AWS_REGION=us-east-1
cd terraform
export ALB=$(terraform output -raw alb_dns_name)
export ASG=$(terraform output -raw asg_name)
export TG=$(terraform output -raw target_group_arn)
export DB=chorombo-bajo-mysql
cd ..
```

## 4. Herramientas

| Herramienta | Uso |
|---|---|
| AWS CLI v2 | Inyectar la falla y observar ASG, Target Group y RDS |
| `tests/simular_contingencia.py` | Sondear `/health` cada 1 s, registrar las fases y calcular los tiempos (exporta `resultados_contingencia.json`) |
| Consola CloudWatch | Dashboard de 4 paneles y estado de las alarmas |
| Correo del administrador | Recepción de las alertas SNS |

## 5. Criterios de éxito

| Criterio | Umbral |
|---|---|
| Interrupción percibida (segundos sin respuesta 200 en `/health` a través del ALB) | **≤ 5 s** |
| Recuperación automática (desde la falla hasta que el reemplazo está `healthy` en el Target Group) | **≤ 5 min** |
| Alerta `hosts-no-saludables` recibida por correo | Sí |
| Intervención manual necesaria | Ninguna |

---

## 6. Procedimiento A — Caída de una instancia EC2

### 6.1 Automatizado (recomendado)

```bash
BASE_URL=http://$ALB python tests/simular_contingencia.py --modo aws --asg $ASG --az us-east-1a
```

El script registra con timestamp **Fase 1: HEALTHY → Fase 2: UNHEALTHY DETECTADO → Fase 3: HEALTHY restablecido**, lista las instancias y deja la evidencia en `tests/resultados_contingencia.json`.

### 6.2 Manual, paso a paso

1. **Estado inicial** (evidencia 1):
   ```bash
   aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names $ASG \
     --query 'AutoScalingGroups[0].Instances[].[InstanceId,AvailabilityZone,LifecycleState,HealthStatus]' --output table
   aws elbv2 describe-target-health --target-group-arn $TG \
     --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State]' --output table
   ```
2. **Sondeo continuo** en otra terminal (evidencia 2):
   ```bash
   while true; do echo "$(date +%T) $(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://$ALB/health)"; sleep 1; done
   ```
3. **Inyectar la falla**: terminar la instancia de `us-east-1a` sin reducir la capacidad deseada:
   ```bash
   VICTIMA=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names $ASG \
     --query "AutoScalingGroups[0].Instances[?AvailabilityZone=='us-east-1a'].InstanceId | [0]" --output text)
   aws autoscaling terminate-instance-in-auto-scaling-group --instance-id $VICTIMA --no-should-decrement-desired-capacity
   ```
4. **Observar cómo el ALB la retira** (estado `draining`) y cómo el ASG lanza el reemplazo:
   ```bash
   watch -n 5 "aws elbv2 describe-target-health --target-group-arn $TG --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State]' --output text"
   aws autoscaling describe-scaling-activities --auto-scaling-group-name $ASG --max-items 5 \
     --query 'Activities[].[StartTime,StatusCode,Description]' --output table
   ```
5. **Fin**: cuando haya 2 targets `healthy` otra vez, anotar la hora y detener el sondeo.

### 6.3 Evidencia esperada

- El sondeo sigue mostrando `200`: la instancia de `us-east-1b` atiende todo el tráfico. A lo sumo se ven 1 o 2 respuestas `502`/`504` mientras el ALB detecta la falla (health check cada 15 s, umbral de 2).
- Target Group: la víctima pasa a `draining` (deregistration delay de 30 s) y desaparece; aparece un target nuevo en `initial` y luego en `healthy`.
- Scaling Activities: *"Terminating EC2 instance: i-… "* y luego *"Launching a new EC2 instance: i-… "* (causa: la instancia se terminó y la capacidad quedó bajo la deseada).
- Dashboard, panel 3: *No saludables* sube a 1 y vuelve a 0; *Saludables* baja a 1 y vuelve a 2.

---

## 7. Procedimiento B — Failover de Amazon RDS Multi-AZ

```bash
aws rds describe-db-instances --db-instance-identifier $DB \
  --query 'DBInstances[0].[DBInstanceStatus,MultiAZ,AvailabilityZone,SecondaryAvailabilityZone]' --output table
aws rds reboot-db-instance --db-instance-identifier $DB --force-failover
# Mientras tanto, mantener el sondeo de /health (paso 6.2.2)
aws rds describe-events --source-identifier $DB --source-type db-instance --duration 30 \
  --query 'Events[].[Date,Message]' --output table
```

**Evidencia esperada**: la zona primaria se intercambia con la secundaria. `/health` responde `503` durante el failover, porque verifica la base con `SELECT 1`; normalmente dura entre 60 y 120 s. Luego vuelve a `200` sin intervención: el endpoint DNS de RDS apunta a la nueva primaria y Prisma reconecta solo. En los eventos de RDS aparecen *"Multi-AZ instance failover started"* y *"… completed"*.

> Nota: durante un failover de RDS la interrupción percibida supera los 5 s por diseño de RDS. El criterio de 5 s aplica a la caída de una instancia de aplicación; para la base, el criterio es recuperación automática ≤ 5 min.

---

## 8. Verificación de alertas SNS

1. Durante el procedimiento A, la alarma **`hosts-no-saludables`** (`UnHealthyHostCount > 0`, 1 periodo de 60 s) pasa a `ALARM`: llega un correo *"ALARM: hosts-no-saludables"*.
2. Al quedar sano el reemplazo, vuelve a `OK` y llega el correo de recuperación (`ok_actions`).
3. Prueba directa, sin esperar una falla real:
   ```bash
   python tests/validar_monitoreo_sns.py --disparar --espera 60
   ```
4. Historial:
   ```bash
   aws cloudwatch describe-alarm-history --alarm-name hosts-no-saludables --history-item-type StateUpdate --max-records 5
   ```

---

## 9. Tabla de tiempos medidos (completar)

| # | Prueba | Hora de la falla | Detección (Fase 2) | Restablecido (Fase 3) | Interrupción percibida | Recuperación | ¿Cumple? |
|---|---|---|---|---|---|---|---|
| A1 | Terminar instancia us-east-1a | | | | ___ s (≤ 5 s) | ___ s (≤ 300 s) | |
| A2 | Repetición | | | | | | |
| B1 | Failover RDS Multi-AZ | | | | ___ s | ___ s (≤ 300 s) | |
| C1 | Correo SNS `hosts-no-saludables` | | Recibido a las ___ | OK a las ___ | — | — | |

### 9.1 Ensayo local (referencia, ya ejecutado)

`python tests/simular_contingencia.py --modo local` reproduce la arquitectura en el equipo: 2 réplicas del backend detrás de un balanceador local, con health check cada 1 s y umbral de 2 fallos. Detiene abruptamente la réplica de "us-east-1a" y, 10 s después, lanza un reemplazo, como hace el ASG. Resultado del 25-09-2026 (`resultados_contingencia.json`):

| Evento | Hora (UTC) |
|---|---|
| Fase 1: HEALTHY (2 réplicas en servicio) | 14:23:34 |
| Falla inyectada (réplica us-east-1a detenida) | 14:23:40 |
| Fase 2: UNHEALTHY DETECTADO (retirada tras 2 checks fallidos) | 14:23:43 |
| Reemplazo lanzado | 14:23:50 |
| Fase 3: HEALTHY restablecido | 14:23:53 |
| **Interrupción percibida** | **4,3 s: CUMPLE** (1 de 11 sondeos con error 502) |
| **Tiempo de recuperación** | **13,1 s: CUMPLE** |

Como contraste, `--replicas 1` (sin redundancia) mide unos 6 s de interrupción y **no cumple**, lo que justifica las 2 instancias en zonas distintas. En Windows, una conexión local a un puerto cerrado no se rechaza al instante, así que el ensayo local sobreestima algo la interrupción respecto de un ALB real.

---

## 10. Conclusiones (completar tras la ejecución en AWS)

- ¿Se cumplieron los criterios de interrupción (≤ 5 s) y de recuperación (≤ 5 min)? _______
- ¿Hizo falta alguna intervención manual? _______
- ¿Llegaron las alertas SNS de ALARM y de OK? _______
- Observaciones y mejoras: _______

**Resultado esperado según el diseño:** con 2 instancias en zonas distintas detrás del ALB, la caída de una instancia (o de toda la zona `us-east-1a`) no deja al servicio sin capacidad. El ASG restablece las 2 instancias en unos 3 a 5 minutos: lanzamiento, user data, grace period de 120 s y 2 health checks de 15 s. RDS Multi-AZ tolera la pérdida de la zona de la base con failover automático.
