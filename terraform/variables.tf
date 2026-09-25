# -----------------------------------------------------------------------------
# Parámetros configurables del proyecto.
# Los valores por defecto corresponden al Documento Técnico de Solución.
# -----------------------------------------------------------------------------

# --- General ------------------------------------------------------------------

variable "aws_region" {
  description = "Región de AWS donde se despliega la solución."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefijo de nombres de los recursos (minúsculas y guiones)."
  type        = string
  default     = "chorombo-bajo"

  validation {
    condition     = can(regex("^[a-z0-9-]{3,24}$", var.project_name))
    error_message = "Use de 3 a 24 caracteres: minúsculas, números y guiones."
  }
}

variable "environment" {
  description = "Nombre del ambiente (etiqueta Environment)."
  type        = string
  default     = "produccion"
}

variable "owner" {
  description = "Responsable de la solución (etiqueta Owner)."
  type        = string
  default     = "Escuela Basica G-733 Chorombo Bajo"
}

# --- Red ----------------------------------------------------------------------

variable "vpc_cidr" {
  description = "Bloque CIDR de la VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_a_cidr" {
  description = "Subred pública de la zona A (ALB y NAT Gateway)."
  type        = string
  default     = "10.20.0.0/24"
}

variable "public_subnet_b_cidr" {
  description = "Subred pública de la zona B (ALB y NAT Gateway)."
  type        = string
  default     = "10.20.1.0/24"
}

variable "private_subnet_a_cidr" {
  description = "Subred privada de la zona A (instancias EC2)."
  type        = string
  default     = "10.20.10.0/24"
}

variable "private_subnet_b_cidr" {
  description = "Subred privada de la zona B (instancias EC2)."
  type        = string
  default     = "10.20.11.0/24"
}

variable "isolated_subnet_a_cidr" {
  description = "Subred aislada de la zona A (Amazon RDS), sin ruta a internet."
  type        = string
  default     = "10.20.20.0/24"
}

variable "isolated_subnet_b_cidr" {
  description = "Subred aislada de la zona B (Amazon RDS), sin ruta a internet."
  type        = string
  default     = "10.20.21.0/24"
}

# --- Cómputo y autoescalado ---------------------------------------------------

variable "instance_type" {
  description = "Tipo de instancia EC2 del Auto Scaling Group."
  type        = string
  default     = "t3.micro"
}

variable "asg_min" {
  description = "Mínimo de instancias (2: una por zona de disponibilidad)."
  type        = number
  default     = 2
}

variable "asg_desired" {
  description = "Capacidad deseada inicial del Auto Scaling Group."
  type        = number
  default     = 2
}

variable "asg_max" {
  description = "Máximo de instancias durante los picos de demanda."
  type        = number
  default     = 4
}

variable "cpu_target" {
  description = "Objetivo de CPU promedio (%) de la política Target Tracking."
  type        = number
  default     = 60
}

variable "app_port" {
  description = "Puerto en el que escucha la aplicación en las instancias."
  type        = number
  default     = 8000
}

variable "health_check_grace_period" {
  description = "Segundos que el ASG espera antes de considerar el health check del ALB en una instancia nueva."
  type        = number
  default     = 120
}

variable "key_name" {
  description = "Par de llaves EC2 opcional para SSH desde dentro de la VPC (bastión). Vacío = solo SSM."
  type        = string
  default     = ""
}

variable "existing_instance_profile" {
  description = "Instance profile existente (AWS Academy: LabInstanceProfile). Si se indica, no se crea el rol IAM."
  type        = string
  default     = ""
}

variable "seed_demo_data" {
  description = "Si es true, las instancias ejecutan el seed (usuarios y documentos de ejemplo) al arrancar; es idempotente."
  type        = bool
  default     = true
}

# --- Base de datos ------------------------------------------------------------

variable "db_instance_class" {
  description = "Clase de instancia de Amazon RDS."
  type        = string
  default     = "db.t3.micro"
}

variable "db_name" {
  description = "Nombre de la base de datos de la aplicación."
  type        = string
  default     = "gestor_documental"
}

variable "db_username" {
  description = "Usuario administrador de la base de datos."
  type        = string
  default     = "gestor_admin"
}

variable "db_password" {
  description = "Contraseña del usuario de la base. Sin valor por defecto: export TF_VAR_db_password=\"...\""
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.db_password) >= 12 && !can(regex("[/@\" ]", var.db_password))
    error_message = "Use al menos 12 caracteres y no incluya /, @, comillas dobles ni espacios (restricción de RDS)."
  }
}

variable "db_allocated_storage" {
  description = "Almacenamiento de RDS en GB (gp3)."
  type        = number
  default     = 20
}

variable "db_multi_az" {
  description = "RDS Multi-AZ: réplica en espera en la otra zona con failover automático."
  type        = bool
  default     = true
}

variable "db_deletion_protection" {
  description = "Protección contra borrado de la instancia RDS."
  type        = bool
  default     = false
}

variable "db_skip_final_snapshot" {
  description = "Omitir el snapshot final al destruir (true facilita `terraform destroy` en ambientes de prueba)."
  type        = bool
  default     = true
}

# --- Almacenamiento -----------------------------------------------------------

variable "use_custom_kms_key" {
  description = "true: llave KMS propia con rotación para el bucket. false: llave administrada aws/s3."
  type        = bool
  default     = true
}

variable "s3_force_destroy" {
  description = "Permite que `terraform destroy` elimine el bucket aunque tenga objetos y versiones."
  type        = bool
  default     = true
}

# --- Monitoreo ----------------------------------------------------------------

variable "alert_email" {
  description = "Correo que recibe las alertas de CloudWatch por SNS (hay que confirmar la suscripción)."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "Días de retención del log group de la aplicación."
  type        = number
  default     = 14
}

# --- Publicación --------------------------------------------------------------

variable "enable_https" {
  description = "Crea un certificado ACM validado por DNS y el listener 443 del ALB (requiere domain_name y hosted_zone_id)."
  type        = bool
  default     = false
}

variable "domain_name" {
  description = "Dominio público de la aplicación (p. ej. gestor.colegiochorombo.cl). Vacío = sin dominio."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "ID de la zona hospedada pública de Route 53 del dominio."
  type        = string
  default     = ""
}

variable "enable_cloudfront" {
  description = "Publica la aplicación con Amazon CloudFront (HTTPS con el certificado *.cloudfront.net)."
  type        = bool
  default     = true
}
