module "share_directory_function" {
  source = "../modules/lambda"

  function_name = "share_directory"
  description   = "Lambda function to add user to groups"

  source_path = "${path.module}/../../../backend/share_directory"
  layers      = [aws_lambda_layer_version.nodejs_common_layer.arn]
  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:Query"
        ]
        Resource = [
          "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/RunaVault_passwords",
        ]
      }
    ]
  })

  allowed_triggers = {
    source_arn = "arn:aws:execute-api:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${module.runa_vault_api.api_id}/*/*/share_directory"
  }

  environment_variables = {
    USER_POOL_ID = aws_cognito_user_pool.main.id
  }
  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_Lambda_ShareDirectory"
    }
  )
}
