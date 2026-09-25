# -----------------------------------------------------------------------------
# Salidas: lo necesario para Ansible, las pruebas y el informe.
# -----------------------------------------------------------------------------

output "alb_dns_name" {
  description = "DNS público del Application Load Balancer."
  value       = aws_lb.app.dns_name
}

output "app_url" {
  description = "URL de la aplicación a través del ALB."
  value       = "http://${aws_lb.app.dns_name}"
}

output "cloudfront_url" {
  description = "URL HTTPS de la aplicación a través de CloudFront (certificado *.cloudfront.net)."
  value       = var.enable_cloudfront ? "https://${try(aws_cloudfront_distribution.app[0].domain_name, "")}" : null
}

output "route53_record" {
  description = "Registro de Route 53 de la aplicación (dominio público o gestor.chorombo.internal en la zona privada)."
  value       = local.use_public_dns ? aws_route53_record.app[0].fqdn : aws_route53_record.internal[0].fqdn
}

output "rds_endpoint" {
  description = "Host del endpoint de Amazon RDS (db_host para Ansible)."
  value       = aws_db_instance.main.address
}

output "s3_bucket_name" {
  description = "Bucket S3 de documentos y artefactos (s3_bucket para Ansible)."
  value       = aws_s3_bucket.documents.id
}

output "asg_name" {
  description = "Nombre del Auto Scaling Group (para generar_inventario.sh y las pruebas)."
  value       = aws_autoscaling_group.app.name
}

output "target_group_arn" {
  description = "ARN del Target Group del ALB."
  value       = aws_lb_target_group.app.arn
}

output "sns_topic_arn" {
  description = "ARN del tópico SNS de alertas."
  value       = aws_sns_topic.alerts.arn
}

output "dashboard_url" {
  description = "Enlace directo al dashboard de CloudWatch."
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards/dashboard/${local.dashboard_name}"
}

output "log_group_name" {
  description = "Log group de CloudWatch con los logs de la aplicación."
  value       = aws_cloudwatch_log_group.app.name
}
