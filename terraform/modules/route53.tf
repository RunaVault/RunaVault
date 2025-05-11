resource "aws_route53_record" "frontend" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.frontend_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.react_app_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.react_app_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api" {
  depends_on = [aws_route53_record.frontend]
  zone_id    = data.aws_route53_zone.main.zone_id
  name       = var.api_domain
  type       = "A"

  alias {
    name                   = module.runa_vault_api.domain_name
    zone_id                = module.runa_vault_api.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "cognito" {
  depends_on = [aws_route53_record.frontend]
  zone_id    = data.aws_route53_zone.main.zone_id
  name       = var.cognito_domain
  type       = "A"

  alias {
    name                   = aws_cognito_user_pool_domain.main.cloudfront_distribution
    zone_id                = aws_cognito_user_pool_domain.main.cloudfront_distribution_zone_id
    evaluate_target_health = false
  }
}
