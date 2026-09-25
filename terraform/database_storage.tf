# -----------------------------------------------------------------------------
# Datos: Amazon RDS MySQL Multi-AZ (metadatos) y bucket Amazon S3 (archivos).
# Cifrado en reposo según ISO/IEC 27018 A.10.3.
# -----------------------------------------------------------------------------

# =============================== Amazon RDS ==================================

resource "aws_db_subnet_group" "main" {
  name        = "${local.name}-db-subnets"
  description = "Subredes aisladas (sin ruta a internet) para RDS"
  subnet_ids  = [aws_subnet.isolated_a.id, aws_subnet.isolated_b.id]

  tags = { Name = "${local.name}-db-subnets" }
}

resource "aws_db_parameter_group" "mysql" {
  name        = "${local.name}-mysql80"
  family      = "mysql8.0"
  description = "UTF-8 completo y zona horaria de Chile"

  parameter {
    name  = "character_set_server"
    value = "utf8mb4"
  }

  parameter {
    name  = "collation_server"
    value = "utf8mb4_unicode_ci"
  }

  parameter {
    name  = "time_zone"
    value = "America/Santiago"
  }
}

resource "aws_db_instance" "main" {
  identifier     = "${local.name}-mysql"
  engine         = "mysql"
  engine_version = "8.0"
  instance_class = var.db_instance_class

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 3306

  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  # Multi-AZ: réplica síncrona en la otra zona con failover automático (~60-120 s).
  multi_az               = var.db_multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db_sg.id]
  publicly_accessible    = false
  parameter_group_name   = aws_db_parameter_group.mysql.name

  backup_retention_period    = 7
  backup_window              = "07:00-08:00" # 03:00-04:00 en Chile (UTC-4)
  maintenance_window         = "sun:08:30-sun:09:30"
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true
  apply_immediately          = true

  enabled_cloudwatch_logs_exports = ["error", "slowquery"]

  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = var.db_skip_final_snapshot
  final_snapshot_identifier = var.db_skip_final_snapshot ? null : "${local.name}-mysql-final"

  tags = { Name = "${local.name}-mysql" }
}

# ========================= Secretos de la aplicación ===========================
# Se guardan cifrados en SSM Parameter Store: el user data los lee al arrancar
# y así no quedan en texto plano en el Launch Template.

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_ssm_parameter" "db_password" {
  name        = "/${local.name}/db_password"
  description = "Contrasena de la base de datos de la aplicacion"
  type        = "SecureString"
  value       = var.db_password
}

resource "aws_ssm_parameter" "jwt_secret" {
  name        = "/${local.name}/jwt_secret"
  description = "Secreto de firma de los JWT"
  type        = "SecureString"
  value       = random_password.jwt_secret.result
}

# ================================ Amazon S3 ===================================

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_kms_key" "s3" {
  count = var.use_custom_kms_key ? 1 : 0

  description             = "Cifrado de los documentos del Gestor Documental (${local.name})"
  enable_key_rotation     = true
  deletion_window_in_days = 7

  tags = { Name = "${local.name}-s3-kms" }
}

resource "aws_kms_alias" "s3" {
  count = var.use_custom_kms_key ? 1 : 0

  name          = "alias/${local.name}-documentos"
  target_key_id = aws_kms_key.s3[0].key_id
}

resource "aws_s3_bucket" "documents" {
  bucket        = "${local.name}-documentos-${random_id.bucket_suffix.hex}"
  force_destroy = var.s3_force_destroy

  tags = { Name = "${local.name}-documentos" }
}

resource "aws_s3_bucket_ownership_controls" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Bloqueo total de acceso público: los archivos solo se entregan con URL firmadas de corta duración.
resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
      # Sin llave propia se usa la llave administrada aws/s3.
      kms_master_key_id = var.use_custom_kms_key ? aws_kms_key.s3[0].arn : null
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "versiones-anteriores"
    status = "Enabled"

    filter {}

    # Las versiones reemplazadas pasan a Standard-IA a los 30 días y se eliminan al año.
    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_expiration {
      noncurrent_days = 365
    }
  }

  rule {
    id     = "subidas-incompletas"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.documents]
}

# Niega cualquier acceso que no use TLS (cifrado en tránsito).
data "aws_iam_policy_document" "documents_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.documents.arn,
      "${aws_s3_bucket.documents.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "documents" {
  bucket = aws_s3_bucket.documents.id
  policy = data.aws_iam_policy_document.documents_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.documents]
}

# CORS: el navegador sube (PUT) y previsualiza (GET) directo en S3 con las URL firmadas.
resource "aws_s3_bucket_cors_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  cors_rule {
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_origins = local.app_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

locals {
  # Orígenes desde donde se usa la app web: ALB, CloudFront y el dominio propio si existe.
  app_origins = compact([
    "http://${aws_lb.app.dns_name}",
    var.enable_https && var.domain_name != "" ? "https://${var.domain_name}" : "",
    var.enable_cloudfront ? "https://${try(aws_cloudfront_distribution.app[0].domain_name, "")}" : "",
  ])
}

locals {
  app_referencia_path   = "${path.module}/../ansible/files/app_referencia.py"
  app_referencia_exists = fileexists(local.app_referencia_path)
}

# Prefijos del bucket: documents/ (archivos subidos por la app) y artifacts/ (despliegue).
# El backend de referencia se sube aquí para que las instancias nuevas lo usen si falta el artefacto principal.
resource "aws_s3_object" "app_referencia" {
  count = local.app_referencia_exists ? 1 : 0

  bucket = aws_s3_bucket.documents.id
  key    = "artifacts/app_referencia.py"
  source = local.app_referencia_path
  # source_hash (no etag): con SSE-KMS el ETag de S3 no es el MD5 del archivo.
  source_hash = local.app_referencia_exists ? filemd5(local.app_referencia_path) : null

  content_type = "text/x-python"
}
