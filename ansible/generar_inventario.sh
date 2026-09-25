#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Regenera inventory.ini con las instancias en ejecución del Auto Scaling Group,
# filtrando por la etiqueta aws:autoscaling:groupName (la agrega el ASG a cada instancia).
#
# Uso:
#   ./generar_inventario.sh                      # ASG y región desde `terraform output`
#   ./generar_inventario.sh chorombo-bajo-asg    # nombre del ASG explícito
#   ./generar_inventario.sh --ssm                # instance-id + conexión por Systems Manager
#
# Variables opcionales: AWS_REGION (por defecto us-east-1), SSH_USER (ec2-user).
# -----------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")"

MODE="ssh"
ASG_NAME=""
for arg in "$@"; do
  case "$arg" in
    --ssm) MODE="ssm" ;;
    -h | --help)
      sed -n '2,13p' "$0"
      exit 0
      ;;
    *) ASG_NAME="$arg" ;;
  esac
done

REGION="${AWS_REGION:-us-east-1}"
SSH_USER="${SSH_USER:-ec2-user}"
TF_DIR="../terraform"

command -v aws >/dev/null || { echo "Error: se requiere AWS CLI (aws configure)." >&2; exit 1; }

tf_output() {
  command -v terraform >/dev/null && terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null || true
}

if [ -z "$ASG_NAME" ]; then
  ASG_NAME="$(tf_output asg_name)"
fi
if [ -z "$ASG_NAME" ]; then
  echo "Error: indique el nombre del ASG o ejecute primero terraform apply." >&2
  exit 1
fi

if [ "$MODE" = "ssm" ]; then
  QUERY='Reservations[].Instances[].InstanceId'
else
  QUERY='Reservations[].Instances[].PrivateIpAddress'
fi

HOSTS="$(aws ec2 describe-instances \
  --region "$REGION" \
  --filters "Name=tag:aws:autoscaling:groupName,Values=$ASG_NAME" "Name=instance-state-name,Values=running" \
  --query "$QUERY" \
  --output text | tr '\t' '\n' | sed '/^$/d' | sort)"

if [ -z "$HOSTS" ]; then
  echo "Error: el ASG $ASG_NAME no tiene instancias en ejecución en $REGION." >&2
  exit 1
fi

{
  echo "# Generado por generar_inventario.sh el $(date '+%Y-%m-%d %H:%M:%S') — ASG: $ASG_NAME ($REGION)"
  echo
  echo "[gestor_documental]"
  echo "$HOSTS"
  echo
  echo "[gestor_documental:vars]"
  echo "ansible_python_interpreter=/usr/bin/python3"
  if [ "$MODE" = "ssm" ]; then
    BUCKET="$(tf_output s3_bucket_name)"
    echo "ansible_connection=community.aws.aws_ssm"
    echo "ansible_aws_ssm_region=$REGION"
    echo "ansible_aws_ssm_bucket_name=${BUCKET:-<bucket-del-proyecto>}"
  else
    echo "ansible_user=$SSH_USER"
    echo "# Si se conecta por un bastión, descomente y ajuste:"
    echo "# ansible_ssh_common_args='-o ProxyJump=ec2-user@<ip-publica-bastion>'"
  fi
} > inventory.ini

echo "inventory.ini actualizado con $(echo "$HOSTS" | wc -l | tr -d ' ') instancia(s) del ASG $ASG_NAME:"
echo "$HOSTS" | sed 's/^/  - /'
