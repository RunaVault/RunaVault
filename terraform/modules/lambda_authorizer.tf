module "authorizer_function" {
  source = "../modules/lambda"

  function_name = "authorizer"
  description   = "Dual-mode (Cognito JWT / machine token) HTTP API Lambda authorizer"

  source_path = "${path.module}/../../../backend/authorizer"
  layers      = [aws_lambda_layer_version.nodejs_common_layer.arn]
  timeout     = 5
  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:UpdateItem"
        ]
        Resource = [
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/RunaVault_machine_tokens",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/RunaVault_machine_tokens/index/token-hash-index"
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem"]
        Resource = ["arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/RunaVault_audit_log"]
      }
    ]
  })

  environment_variables = {
    USER_POOL_ID         = aws_cognito_user_pool.main.id
    USER_POOL_CLIENT_ID  = aws_cognito_user_pool_client.app_client.id
    COGNITO_ISSUER       = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
    MACHINE_TOKENS_TABLE = aws_dynamodb_table.machine_tokens.name
    AUDIT_TABLE_NAME     = aws_dynamodb_table.audit_log.name
  }

  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_Lambda_Authorizer"
    }
  )
}

# API Gateway invokes the authorizer directly (not via a route integration),
# so this needs its own permission rather than the lambda module's
# route-scoped allowed_triggers.
resource "aws_lambda_permission" "authorizer_invoke" {
  statement_id  = "AllowExecutionFromAPIGatewayAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = module.authorizer_function.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:${module.runa_vault_api.api_id}/authorizers/*"
}
