module "edit_users_function" {
  source = "../modules/lambda"

  function_name = "edit_users"
  description   = "Lambda function to edit users"

  source_path = "${path.module}/../../../backend/edit_users"
  layers      = [aws_lambda_layer_version.nodejs_common_layer.arn]
  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminResetUserPassword",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminSetUserPassword"
        ]
        Resource = [
          "arn:aws:cognito-idp:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:userpool/${aws_cognito_user_pool.main.id}"
        ]
      }
    ]
  })

  allowed_triggers = {
    source_arn = "arn:aws:execute-api:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${module.runa_vault_api.api_id}/*/*/edit_users"
  }

  environment_variables = {
    USER_POOL_ID = aws_cognito_user_pool.main.id
  }
  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_Lambda_EditUsers"
    }
  )
}
