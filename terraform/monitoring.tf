# -----------------------------------------------------------------------------
# Observabilidad (ISO/IEC 27017 CLD.12.4.5): alarmas de CloudWatch con aviso por correo (SNS),
# dashboard para saber de un vistazo si la plataforma funciona bien, y log group de la aplicación.
# -----------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alertas"

  tags = { Name = "${local.name}-alertas" }
}

# La persona destinataria debe confirmar la suscripción desde el correo que envía AWS.
resource "aws_sns_topic_subscription" "email" {
  count = var.alert_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# --- Alarma 1: CPU alta del Auto Scaling Group --------------------------------------
# Umbral 70%: 10 puntos sobre el objetivo de escalado (60%). Si la CPU sigue sobre 70% durante
# 3 minutos, el autoescalado no alcanzó a reaccionar (o llegó al máximo de 4 instancias) y hay que avisar.
resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "cpu-alta"
  alarm_description   = "CPU promedio del ASG sobre 70% durante 3 minutos: el autoescalado no alcanza a reaccionar."
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 3
  threshold           = 70
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.app.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# --- Alarma 2: hosts no saludables en el Target Group ------------------------------
# Umbral > 0: cualquier instancia no saludable es capacidad perdida (el ASG la reemplazará,
# pero la persona a cargo debe saberlo).
resource "aws_cloudwatch_metric_alarm" "hosts_unhealthy" {
  alarm_name          = "hosts-no-saludables"
  alarm_description   = "Hay instancias que no responden /health en el Target Group del ALB."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TargetGroup  = aws_lb_target_group.app.arn_suffix
    LoadBalancer = aws_lb.app.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# --- Alarma 3: conexiones altas a la base de datos --------------------------------
# Umbral 40: alerta temprana, bastante antes del límite de conexiones de db.t3.micro
# (max_connections ≈ 60-85 según la memoria disponible).
resource "aws_cloudwatch_metric_alarm" "db_connections_high" {
  alarm_name          = "db-conexiones-altas"
  alarm_description   = "Más de 40 conexiones a RDS durante 3 minutos: se acerca al límite de db.t3.micro."
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 3
  threshold           = 40
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# --- Dashboard con 4 paneles ------------------------------------------------------------

locals {
  dashboard_name = "chorombo-bajo-gestor-documental"
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = local.dashboard_name

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "1. CPU del Auto Scaling Group (%)"
          region  = var.aws_region
          view    = "timeSeries"
          stat    = "Average"
          period  = 60
          metrics = [["AWS/EC2", "CPUUtilization", "AutoScalingGroupName", aws_autoscaling_group.app.name]]
          annotations = {
            horizontal = [
              { label = "Objetivo de escalado (60%)", value = var.cpu_target },
              { label = "Alarma cpu-alta (70%)", value = 70, color = "#d62728" },
            ]
          }
          yAxis = { left = { min = 0, max = 100 } }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "2. ALB: latencia y solicitudes"
          region = var.aws_region
          view   = "timeSeries"
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.app.arn_suffix, { stat = "Average", label = "Latencia promedio (s)" }],
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.app.arn_suffix, { stat = "Sum", label = "Solicitudes", yAxis = "right" }],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.app.arn_suffix, { stat = "Sum", label = "Errores 5XX", yAxis = "right" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "3. Instancias saludables / no saludables"
          region = var.aws_region
          view   = "timeSeries"
          stat   = "Maximum"
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", aws_lb_target_group.app.arn_suffix, "LoadBalancer", aws_lb.app.arn_suffix, { label = "Saludables", color = "#2ca02c" }],
            ["AWS/ApplicationELB", "UnHealthyHostCount", "TargetGroup", aws_lb_target_group.app.arn_suffix, "LoadBalancer", aws_lb.app.arn_suffix, { label = "No saludables", color = "#d62728" }],
          ]
          yAxis = { left = { min = 0 } }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "4. RDS: conexiones y almacenamiento libre"
          region = var.aws_region
          view   = "timeSeries"
          period = 60
          metrics = [
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", aws_db_instance.main.identifier, { stat = "Average", label = "Conexiones" }],
            ["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", aws_db_instance.main.identifier, { stat = "Minimum", label = "Almacenamiento libre (bytes)", yAxis = "right" }],
          ]
          annotations = {
            horizontal = [{ label = "Alarma db-conexiones-altas (40)", value = 40, color = "#d62728" }]
          }
        }
      },
    ]
  })
}

# --- Log group de la aplicación (lo alimenta CloudWatch Agent) ------------------------

resource "aws_cloudwatch_log_group" "app" {
  name              = "/chorombo/gestor-documental"
  retention_in_days = var.log_retention_days

  tags = { Name = "${local.name}-logs" }
}
