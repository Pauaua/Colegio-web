# -----------------------------------------------------------------------------
# Gestor Documental — Escuela Básica G-733 Chorombo Bajo (María Pinto)
# Proveedor, etiquetas comunes y datos compartidos (zonas de disponibilidad y AMI).
# -----------------------------------------------------------------------------

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

locals {
  name = var.project_name

  common_tags = {
    Project     = "chorombo_bajo"
    Environment = var.environment
    Owner       = var.owner
  }

  # Las dos primeras zonas de la región (en us-east-1: us-east-1a y us-east-1b).
  azs = slice(sort(data.aws_availability_zones.available.names), 0, 2)

  # Clave del artefacto de despliegue en el bucket (la genera `npm run build:artifact` y la sube Ansible).
  artifact_key = "artifacts/gestor-documental-latest.tar.gz"
}

data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

# Amazon Linux 2023 (x86_64) más reciente.
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}
