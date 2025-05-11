output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.react_app_distribution.domain_name
}

output "s3_bucket_name" {
  value = aws_s3_bucket.runa_vault_bucket.id
}

output "identity_pool_id" {
  value = aws_cognito_identity_pool.main.id
}

output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.app_client.id
}

output "api_gateway_invoke_url" {
  value = module.runa_vault_api.invoke_url
}
