# -----------------------------------------------------------------------------
# Cómputo y publicación: ALB, Target Group, Launch Template, Auto Scaling Group,
# IAM de mínimo privilegio, Amazon CloudFront y Amazon Route 53.
# -----------------------------------------------------------------------------

locals {
  create_iam            = var.existing_instance_profile == ""
  instance_profile_name = local.create_iam ? aws_iam_instance_profile.app[0].name : var.existing_instance_profile
  use_public_dns        = var.domain_name != "" && var.hosted_zone_id != ""
  # Con CloudFront el tráfico llega al ALB por HTTP; solo sin CloudFront se redirige 80 → 443 en el ALB.
  http_redirects_to_https = var.enable_https && !var.enable_cloudfront
  cloudfront_aliases      = var.enable_https && var.domain_name != "" ? [var.domain_name] : []
}

# ======================= Application Load Balancer ============================

resource "aws_lb" "app" {
  name                       = "${local.name}-alb"
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.alb_sg.id]
  subnets                    = [aws_subnet.public_a.id, aws_subnet.public_b.id]
  idle_timeout               = 60
  drop_invalid_header_fields = true

  tags = { Name = "${local.name}-alb" }
}

resource "aws_lb_target_group" "app" {
  name                 = "${local.name}-tg"
  port                 = var.app_port
  protocol             = "HTTP"
  target_type          = "instance"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 30

  # /health verifica la base de datos con SELECT 1: una instancia sin base se retira del balanceo.
  health_check {
    path                = "/health"
    matcher             = "200"
    protocol            = "HTTP"
    port                = "traffic-port"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = { Name = "${local.name}-tg" }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = local.http_redirects_to_https ? "redirect" : "forward"
    target_group_arn = local.http_redirects_to_https ? null : aws_lb_target_group.app.arn

    dynamic "redirect" {
      for_each = local.http_redirects_to_https ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

# --- HTTPS opcional (enable_https = true): certificado ACM validado por DNS en Route 53 ---

resource "aws_acm_certificate" "app" {
  count = var.enable_https ? 1 : 0

  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true

    precondition {
      condition     = var.domain_name != "" && var.hosted_zone_id != ""
      error_message = "enable_https = true requiere domain_name y hosted_zone_id."
    }
  }

  tags = { Name = "${local.name}-cert" }
}

resource "aws_route53_record" "cert_validation" {
  for_each = var.enable_https ? {
    for dvo in aws_acm_certificate.app[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  } : {}

  zone_id         = var.hosted_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "app" {
  count = var.enable_https ? 1 : 0

  certificate_arn         = aws_acm_certificate.app[0].arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

resource "aws_lb_listener" "https" {
  count = var.enable_https ? 1 : 0

  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.app[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# =================== IAM: rol de instancia de mínimo privilegio ===================

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "app" {
  # Objetos del bucket del proyecto (documentos y artefactos), y nada más.
  statement {
    sid       = "ProjectBucketObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.documents.arn}/*"]
  }

  statement {
    sid       = "ProjectBucketList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.documents.arn]
  }

  # Uso de la llave KMS propia del bucket (SSE-KMS).
  dynamic "statement" {
    for_each = var.use_custom_kms_key ? [1] : []
    content {
      sid       = "ProjectBucketKms"
      actions   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"]
      resources = [aws_kms_key.s3[0].arn]
    }
  }

  # Lectura de los secretos de la aplicación en SSM Parameter Store.
  statement {
    sid       = "AppSecrets"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = [aws_ssm_parameter.db_password.arn, aws_ssm_parameter.jwt_secret.arn]
  }
}

resource "aws_iam_role" "app" {
  count = local.create_iam ? 1 : 0

  name               = "${local.name}-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json

  tags = { Name = "${local.name}-ec2-role" }
}

resource "aws_iam_role_policy" "app" {
  count = local.create_iam ? 1 : 0

  name   = "${local.name}-app-least-privilege"
  role   = aws_iam_role.app[0].id
  policy = data.aws_iam_policy_document.app.json
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  count = local.create_iam ? 1 : 0

  role       = aws_iam_role.app[0].name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  count = local.create_iam ? 1 : 0

  role       = aws_iam_role.app[0].name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "app" {
  count = local.create_iam ? 1 : 0

  name = "${local.name}-ec2-profile"
  role = aws_iam_role.app[0].name
}

# ============================ Launch Template ==================================

locals {
  # Configuración de CloudWatch Agent: logs de la aplicación + memoria y disco.
  cloudwatch_agent_config = jsonencode({
    agent = { metrics_collection_interval = 60, run_as_user = "root" }
    logs = {
      logs_collected = {
        files = {
          collect_list = [{
            file_path         = "/var/log/gestor-documental/app.log"
            log_group_name    = aws_cloudwatch_log_group.app.name
            log_stream_name   = "{instance_id}"
            retention_in_days = var.log_retention_days
          }]
        }
      }
    }
    metrics = {
      namespace         = "CWAgent"
      append_dimensions = { AutoScalingGroupName = "$${aws:AutoScalingGroupName}", InstanceId = "$${aws:InstanceId}" }
      metrics_collected = {
        mem  = { measurement = ["mem_used_percent"] }
        disk = { measurement = ["used_percent"], resources = ["/"] }
      }
    }
  })

  # User data: deja cada instancia nueva del ASG operativa sin intervención manual.
  # Instala Node.js 20, Python 3 y CloudWatch Agent; lee los secretos de SSM; descarga el último
  # artefacto desde S3 y levanta el servicio con systemd. Si no hay artefacto, levanta app_referencia.py.
  user_data = <<-EOT
    #!/bin/bash
    set -euo pipefail
    exec > >(tee -a /var/log/user-data.log) 2>&1
    echo "== Arranque Gestor Documental: $(date -Is)"

    REGION="${var.aws_region}"
    BUCKET="${aws_s3_bucket.documents.id}"
    ARTIFACT_KEY="${local.artifact_key}"
    APP_PORT="${var.app_port}"
    DB_HOST="${aws_db_instance.main.address}"
    DB_NAME="${var.db_name}"
    DB_USER="${var.db_username}"
    SSM_PREFIX="/${local.name}"
    SEED_DEMO_DATA="${var.seed_demo_data}"
    APP_DIR=/opt/gestor-documental
    LOG_DIR=/var/log/gestor-documental
    ENV_DIR=/etc/gestor-documental

    # 1. Paquetes: Node.js 20, Python 3 y CloudWatch Agent
    dnf install -y python3 python3-pip amazon-cloudwatch-agent tar gzip
    dnf install -y nodejs20 nodejs20-npm || dnf install -y nodejs nodejs-npm
    for bin in node npm npx; do
      if [ -x "/usr/bin/$bin-20" ]; then ln -sf "/usr/bin/$bin-20" "/usr/local/bin/$bin"; fi
    done
    pip3 install --quiet PyMySQL || true

    # 2. Usuario de sistema y directorios
    id gestor >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /sbin/nologin gestor
    mkdir -p "$APP_DIR" "$LOG_DIR" "$ENV_DIR"
    chown gestor:gestor "$LOG_DIR"

    # 3. Secretos desde SSM Parameter Store y variables de entorno
    ssm() { aws ssm get-parameter --region "$REGION" --name "$SSM_PREFIX/$1" --with-decryption --query Parameter.Value --output text; }
    DB_PASSWORD="$(ssm db_password)"
    JWT_SECRET="$(ssm jwt_secret)"
    DB_PASSWORD_URL="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$DB_PASSWORD")"
    TOKEN="$(curl -sX PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 300')"
    INSTANCE_ID="$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)"

    cat > "$ENV_DIR/app.env" <<EOF
    NODE_ENV=production
    PORT=$APP_PORT
    DATABASE_URL=mysql://$DB_USER:$DB_PASSWORD_URL@$DB_HOST:3306/$DB_NAME
    JWT_SECRET=$JWT_SECRET
    S3_BUCKET=$BUCKET
    AWS_REGION=$REGION
    LOG_FILE=$LOG_DIR/app.log
    INSTANCE_ID=$INSTANCE_ID
    WEB_DIST_DIR=$APP_DIR/app/dist
    DB_HOST=$DB_HOST
    DB_PORT=3306
    DB_NAME=$DB_NAME
    DB_USER=$DB_USER
    DB_PASSWORD=$DB_PASSWORD
    EOF
    chown root:gestor "$ENV_DIR/app.env"
    chmod 640 "$ENV_DIR/app.env"

    # 4. CloudWatch Agent (logs de la app, memoria y disco)
    cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'EOF'
    ${local.cloudwatch_agent_config}
    EOF
    /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s \
      -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json || true

    # 5. Aplicación principal desde el último artefacto; si no existe, backend de referencia
    if aws s3 cp --region "$REGION" "s3://$BUCKET/$ARTIFACT_KEY" /tmp/gestor-documental.tar.gz; then
      tar -xzf /tmp/gestor-documental.tar.gz -C "$APP_DIR"
      cd "$APP_DIR/backend"
      [ -d node_modules ] || npm ci --omit=dev
      set -a; . "$ENV_DIR/app.env"; set +a
      # Migraciones idempotentes (Prisma usa un bloqueo, así que varias instancias pueden arrancar a la vez).
      for i in 1 2 3 4 5 6 7 8 9 10; do npx prisma migrate deploy && break || sleep 15; done
      if [ "$SEED_DEMO_DATA" = "true" ]; then node dist/prisma/seed.js || true; fi
      chown -R gestor:gestor "$APP_DIR"
      cat > /etc/systemd/system/gestor-documental.service <<EOF
    [Unit]
    Description=Gestor Documental Chorombo Bajo (API + app web)
    After=network-online.target
    Wants=network-online.target

    [Service]
    Type=simple
    User=gestor
    WorkingDirectory=$APP_DIR/backend
    EnvironmentFile=$ENV_DIR/app.env
    ExecStart=/usr/local/bin/node dist/src/server.js
    Restart=always
    RestartSec=5

    [Install]
    WantedBy=multi-user.target
    EOF
      systemctl daemon-reload
      systemctl enable --now gestor-documental
    else
      echo "Sin artefacto en s3://$BUCKET/$ARTIFACT_KEY: se levanta app_referencia.py"
      mkdir -p "$APP_DIR/referencia"
      aws s3 cp --region "$REGION" "s3://$BUCKET/artifacts/app_referencia.py" "$APP_DIR/referencia/app_referencia.py"
      chown -R gestor:gestor "$APP_DIR"
      cat > /etc/systemd/system/gestor-referencia.service <<EOF
    [Unit]
    Description=Gestor Documental - backend de referencia (Python)
    After=network-online.target

    [Service]
    Type=simple
    User=gestor
    WorkingDirectory=$APP_DIR/referencia
    EnvironmentFile=$ENV_DIR/app.env
    ExecStart=/usr/bin/python3 $APP_DIR/referencia/app_referencia.py
    Restart=always
    RestartSec=5

    [Install]
    WantedBy=multi-user.target
    EOF
      systemctl daemon-reload
      systemctl enable --now gestor-referencia
    fi
    echo "== Arranque completo: $(date -Is)"
  EOT
}

resource "aws_launch_template" "app" {
  name_prefix   = "${local.name}-lt-"
  description   = "Gestor Documental: Amazon Linux 2023 + Node.js 20"
  image_id      = data.aws_ami.al2023.id
  instance_type = var.instance_type
  key_name      = var.key_name != "" ? var.key_name : null
  user_data     = base64encode(local.user_data)

  vpc_security_group_ids = [aws_security_group.app_sg.id]

  iam_instance_profile {
    name = local.instance_profile_name
  }

  # IMDSv2 obligatorio (evita el robo de credenciales vía SSRF).
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  # Monitoreo detallado: métricas cada 1 minuto (necesario para la alarma cpu-alta de 60 s).
  monitoring {
    enabled = true
  }

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = 8
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags          = merge(local.common_tags, { Name = "${local.name}-app" })
  }

  tag_specifications {
    resource_type = "volume"
    tags          = merge(local.common_tags, { Name = "${local.name}-app" })
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ============================ Auto Scaling Group ================================

resource "aws_autoscaling_group" "app" {
  name                = "${local.name}-asg"
  min_size            = var.asg_min
  desired_capacity    = var.asg_desired
  max_size            = var.asg_max
  vpc_zone_identifier = [aws_subnet.private_a.id, aws_subnet.private_b.id] # distribución equilibrada entre las 2 zonas
  target_group_arns   = [aws_lb_target_group.app.arn]

  # El ALB decide la salud: una instancia que falla /health se reemplaza automáticamente.
  health_check_type         = "ELB"
  health_check_grace_period = var.health_check_grace_period
  default_instance_warmup   = 120

  launch_template {
    id      = aws_launch_template.app.id
    version = aws_launch_template.app.latest_version
  }

  # Al cambiar el Launch Template, las instancias se reemplazan de a poco sin cortar el servicio.
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
    }
  }

  enabled_metrics = [
    "GroupMinSize",
    "GroupMaxSize",
    "GroupDesiredCapacity",
    "GroupInServiceInstances",
    "GroupPendingInstances",
    "GroupTerminatingInstances",
    "GroupTotalInstances",
  ]
  metrics_granularity = "1Minute"

  dynamic "tag" {
    for_each = merge(local.common_tags, { Name = "${local.name}-app" })
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  # La capacidad deseada la ajusta la política de escalado; Terraform no la revierte.
  lifecycle {
    ignore_changes = [desired_capacity]
  }

  # Las instancias necesitan salida a internet (NAT) al arrancar para instalar paquetes.
  depends_on = [
    aws_nat_gateway.a,
    aws_nat_gateway.b,
    aws_route_table_association.private_a,
    aws_route_table_association.private_b,
  ]
}

# Política Target Tracking sobre la CPU promedio del grupo (objetivo 60%).
#  - Scale-out: si la CPU promedio supera el 60% durante unos 3 minutos (3 periodos de 1 min),
#    el ASG agrega instancias (p. ej. de 2 a 3, hasta un máximo de 4) para volver al objetivo.
#  - Scale-in: cuando la CPU baja (alrededor del 30%) durante unos 5 minutos, quita instancias
#    hasta el mínimo de 2, reduciendo capacidad y costo fuera de los picos.
#    Nota: la alarma de reducción que crea AWS es deliberadamente más conservadora que la de
#    aumento (puede tardar más), para evitar oscilaciones.
resource "aws_autoscaling_policy" "cpu_target_tracking" {
  name                      = "${local.name}-cpu-target-tracking"
  autoscaling_group_name    = aws_autoscaling_group.app.name
  policy_type               = "TargetTrackingScaling"
  estimated_instance_warmup = 120

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value     = var.cpu_target
    disable_scale_in = false
  }
}

# ============================== Amazon CloudFront ================================
# HTTPS para los usuarios con el certificado *.cloudfront.net aunque la escuela no tenga dominio.

data "aws_cloudfront_cache_policy" "disabled" {
  count = var.enable_cloudfront ? 1 : 0
  name  = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "optimized" {
  count = var.enable_cloudfront ? 1 : 0
  name  = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  count = var.enable_cloudfront ? 1 : 0
  name  = "Managed-AllViewer"
}

resource "aws_cloudfront_distribution" "app" {
  count = var.enable_cloudfront ? 1 : 0

  enabled         = true
  is_ipv6_enabled = true
  comment         = "Gestor Documental Chorombo Bajo"
  price_class     = "PriceClass_100"
  http_version    = "http2and3"
  aliases         = local.cloudfront_aliases

  origin {
    origin_id   = "alb"
    domain_name = aws_lb.app.dns_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 30
    }
  }

  # API y páginas: sin caché, se reenvía todo al ALB (headers, query string y cookies).
  default_cache_behavior {
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled[0].id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer[0].id
    compress                 = true
  }

  # Contenido estático del build web: con caché en el borde.
  dynamic "ordered_cache_behavior" {
    for_each = ["/_expo/*", "/assets/*", "*.js", "*.css", "*.png"]
    content {
      path_pattern           = ordered_cache_behavior.value
      target_origin_id       = "alb"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD"]
      cached_methods         = ["GET", "HEAD"]
      cache_policy_id        = data.aws_cloudfront_cache_policy.optimized[0].id
      compress               = true
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = length(local.cloudfront_aliases) == 0
    acm_certificate_arn            = length(local.cloudfront_aliases) > 0 ? aws_acm_certificate_validation.app[0].certificate_arn : null
    ssl_support_method             = length(local.cloudfront_aliases) > 0 ? "sni-only" : null
    minimum_protocol_version       = length(local.cloudfront_aliases) > 0 ? "TLSv1.2_2021" : "TLSv1"
  }

  tags = { Name = "${local.name}-cdn" }
}

# ================================ Amazon Route 53 ==================================

# Con dominio propio: registro A Alias hacia CloudFront (o hacia el ALB si CloudFront está desactivado).
resource "aws_route53_record" "app" {
  count = local.use_public_dns ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.enable_cloudfront ? try(aws_cloudfront_distribution.app[0].domain_name, "") : aws_lb.app.dns_name
    zone_id                = var.enable_cloudfront ? try(aws_cloudfront_distribution.app[0].hosted_zone_id, "") : aws_lb.app.zone_id
    evaluate_target_health = !var.enable_cloudfront
  }
}

# Sin dominio: zona hospedada privada asociada a la VPC, para que el componente de publicación exista y sea verificable.
resource "aws_route53_zone" "internal" {
  count = local.use_public_dns ? 0 : 1

  name    = "chorombo.internal"
  comment = "Zona privada del Gestor Documental (sin dominio publico)"

  vpc {
    vpc_id = aws_vpc.main.id
  }

  tags = { Name = "${local.name}-private-zone" }
}

resource "aws_route53_record" "internal" {
  count = local.use_public_dns ? 0 : 1

  zone_id = aws_route53_zone.internal[0].zone_id
  name    = "gestor.chorombo.internal"
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}
