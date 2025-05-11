resource "aws_apigatewayv2_api" "api" {
  name          = var.api_name
  protocol_type = "HTTP"
  description   = var.api_description

  cors_configuration {
    allow_headers = var.cors_allow_headers
    allow_methods = var.cors_allow_methods
    allow_origins = var.cors_allow_origins
  }

  tags = merge(
    var.tags,
    {
      Name = "RunaVault_${var.api_name}"
    }
  )
}

# Create the JWT authorizer
resource "aws_apigatewayv2_authorizer" "authorizer" {
  count = var.create_authorizer ? 1 : 0

  api_id           = aws_apigatewayv2_api.api.id
  authorizer_type  = "JWT"
  identity_sources = var.authorizer_identity_sources
  name             = var.authorizer_name

  jwt_configuration {
    audience = var.authorizer_audience
    issuer   = var.authorizer_issuer
  }
}

# Create integrations for Lambda functions
resource "aws_apigatewayv2_integration" "integration" {
  for_each = var.integrations

  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_method     = each.value.method
  integration_uri        = each.value.uri
  payload_format_version = "2.0"
}

# Create routes for the API Gateway
resource "aws_apigatewayv2_route" "route" {
  for_each = var.routes

  api_id             = aws_apigatewayv2_api.api.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.integration[each.value.integration_key].id}"
  authorization_type = var.create_authorizer ? "JWT" : null
  authorizer_id      = var.create_authorizer ? aws_apigatewayv2_authorizer.authorizer[0].id : null
}

resource "aws_apigatewayv2_stage" "stage" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = var.stage_name
  auto_deploy = true
}

resource "aws_apigatewayv2_domain_name" "this" {
  domain_name = var.api_domain

  domain_name_configuration {
    certificate_arn = var.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "this" {
  api_id      = aws_apigatewayv2_api.api.id
  domain_name = aws_apigatewayv2_domain_name.this.id
  stage       = aws_apigatewayv2_stage.stage.id
}