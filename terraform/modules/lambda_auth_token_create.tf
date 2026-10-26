module "auth_token_create_function" {
  source = "../modules/lambda"

  function_name = "auth_token_create"
  description   = "Lambda function to create a machine token"

  source_path = "${path.module}/../../../backend/auth_token_create"
  layers      = [aws_lambda_layer_version.nodejs_common_layer.arn]
  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem"]
        Resource = ["arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/RunaVault_machine_tokens"]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem"]
        Resource = ["arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/RunaVault_audit_log"]
      }
    ]
  })

  allowed_triggers = {
    source_arn = "arn:aws:execute-api:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:${module.runa_vault_api.api_id}/*/*/auth/tokens"
  }

  environment_variables = {
    MACHINE_TOKENS_TABLE = aws_dynamodb_table.machine_tokens.name
    AUDIT_TABLE_NAME     = aws_dynamodb_table.audit_log.name
  }
  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_Lambda_AuthTokenCreate"
    }
  )
}
