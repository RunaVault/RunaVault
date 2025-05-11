module "list_secrets_function" {
  source = "../modules/lambda"

  function_name = "list_secrets"
  description   = "Lambda function to list secrets"
  timeout       = 15

  source_path = "${path.module}/../../../backend/list_secrets"
  layers      = [aws_lambda_layer_version.nodejs_common_layer.arn]
  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:GetItem"
        ]
        Resource = [
          "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/RunaVault_passwords",
          "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/RunaVault_passwords/index/shared_with_groups-index",
          "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/RunaVault_passwords/index/shared_with_users-index"
        ]
      }
    ]
  })

  allowed_triggers = {
    source_arn = "arn:aws:execute-api:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${module.runa_vault_api.api_id}/*/*/list_secrets"
  }

  environment_variables = {
    USER_POOL_ID = aws_cognito_user_pool.main.id
  }
  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_Lambda_ListSecrets"
    }
  )
}
