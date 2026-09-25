# -----------------------------------------------------------------------------
# Red: VPC en 2 zonas con subredes públicas (ALB, NAT), privadas (EC2) y aisladas (RDS).
# Segregación de red según ISO/IEC 27017 CLD.9.5.1 y CLD.13.1.4: solo el ALB queda expuesto.
# -----------------------------------------------------------------------------

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${local.name}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${local.name}-igw" }
}

# --- Subredes públicas (ALB y NAT) --------------------------------------------

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_a_cidr
  availability_zone       = local.azs[0]
  map_public_ip_on_launch = false

  tags = { Name = "${local.name}-public-a", Tier = "public" }
}

resource "aws_subnet" "public_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_b_cidr
  availability_zone       = local.azs[1]
  map_public_ip_on_launch = false

  tags = { Name = "${local.name}-public-b", Tier = "public" }
}

# --- Subredes privadas (EC2 del Auto Scaling Group) ---------------------------

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_a_cidr
  availability_zone = local.azs[0]

  tags = { Name = "${local.name}-private-a", Tier = "private" }
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_b_cidr
  availability_zone = local.azs[1]

  tags = { Name = "${local.name}-private-b", Tier = "private" }
}

# --- Subredes aisladas (Amazon RDS): sin ruta a internet ----------------------

resource "aws_subnet" "isolated_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.isolated_subnet_a_cidr
  availability_zone = local.azs[0]

  tags = { Name = "${local.name}-isolated-a", Tier = "isolated" }
}

resource "aws_subnet" "isolated_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.isolated_subnet_b_cidr
  availability_zone = local.azs[1]

  tags = { Name = "${local.name}-isolated-b", Tier = "isolated" }
}

# --- Un NAT Gateway por zona ----------------------------------------------------
# Si cae una zona, las instancias de la otra conservan su salida a internet
# (no hay un único punto de falla compartido).

resource "aws_eip" "nat_a" {
  domain = "vpc"

  tags = { Name = "${local.name}-nat-a" }
}

resource "aws_eip" "nat_b" {
  domain = "vpc"

  tags = { Name = "${local.name}-nat-b" }
}

resource "aws_nat_gateway" "a" {
  allocation_id = aws_eip.nat_a.id
  subnet_id     = aws_subnet.public_a.id

  tags = { Name = "${local.name}-nat-a" }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "b" {
  allocation_id = aws_eip.nat_b.id
  subnet_id     = aws_subnet.public_b.id

  tags = { Name = "${local.name}-nat-b" }

  depends_on = [aws_internet_gateway.main]
}

# --- Tablas de rutas ------------------------------------------------------------

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name}-rt-public" }
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

# Cada subred privada sale a internet por el NAT de SU propia zona.
resource "aws_route_table" "private_a" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.a.id
  }

  tags = { Name = "${local.name}-rt-private-a" }
}

resource "aws_route_table" "private_b" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.b.id
  }

  tags = { Name = "${local.name}-rt-private-b" }
}

resource "aws_route_table_association" "private_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private_a.id
}

resource "aws_route_table_association" "private_b" {
  subnet_id      = aws_subnet.private_b.id
  route_table_id = aws_route_table.private_b.id
}

# Las subredes aisladas solo tienen la ruta local de la VPC: sin salida a internet.
resource "aws_route_table" "isolated" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${local.name}-rt-isolated" }
}

resource "aws_route_table_association" "isolated_a" {
  subnet_id      = aws_subnet.isolated_a.id
  route_table_id = aws_route_table.isolated.id
}

resource "aws_route_table_association" "isolated_b" {
  subnet_id      = aws_subnet.isolated_b.id
  route_table_id = aws_route_table.isolated.id
}

# --- VPC Gateway Endpoint de S3 -------------------------------------------------
# Las EC2 llegan a S3 por la red de AWS, sin pasar por el NAT (más seguro y sin costo de procesamiento del NAT).

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private_a.id, aws_route_table.private_b.id]

  tags = { Name = "${local.name}-vpce-s3" }
}

# --- Security Groups encadenados: internet → ALB → EC2 (8000) → RDS (3306) -----

resource "aws_security_group" "alb_sg" {
  name        = "${local.name}-alb-sg"
  description = "ALB publico: HTTP (y HTTPS si enable_https) desde internet"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP desde internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  dynamic "ingress" {
    for_each = var.enable_https ? [1] : []
    content {
      description = "HTTPS desde internet"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  egress {
    description = "Hacia las instancias de la aplicacion"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = { Name = "${local.name}-alb-sg" }
}

resource "aws_security_group" "app_sg" {
  name        = "${local.name}-app-sg"
  description = "Instancias EC2: puerto de la aplicacion solo desde el ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Aplicacion (8000) solo desde el ALB"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]
  }

  dynamic "ingress" {
    for_each = var.key_name != "" ? [1] : []
    content {
      description = "SSH solo desde dentro de la VPC (bastion), si se configura key_name"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [var.vpc_cidr]
    }
  }

  egress {
    description = "Salida: paquetes, S3 (endpoint), SSM, CloudWatch y RDS"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-app-sg" }
}

resource "aws_security_group" "db_sg" {
  name        = "${local.name}-db-sg"
  description = "RDS MySQL: 3306 solo desde las instancias de la aplicacion"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "MySQL solo desde app_sg"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.app_sg.id]
  }

  tags = { Name = "${local.name}-db-sg" }
}
