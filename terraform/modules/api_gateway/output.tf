output "api_id" {
  description = "The ID of the API Gateway"
  value       = aws_apigatewayv2_api.api.id
}

output "invoke_url" {
  description = "The invocation URL of the API Gateway"
  value       = aws_apigatewayv2_stage.stage.invoke_url
}
output "domain_name" {
  description = "The custom domain name for the API Gateway"
  value       = aws_apigatewayv2_domain_name.this.domain_name_configuration[0].target_domain_name
}

output "hosted_zone_id" {
  description = "The hosted zone ID for the API Gateway domain name"
  value       = aws_apigatewayv2_domain_name.this.domain_name_configuration[0].hosted_zone_id
}