module "get_secret_function" {
  source = "../modules/lambda"

  function_name = "get_secret"
  description   = "Lambda function to get secret"

  source_path = "${path.module}/../../../backend/get_secret"
  layers      = [aws_lambda_layer_version.nodejs_common_layer.arn]
  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query"
        ]
        Resource = [
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/RunaVault_passwords",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/RunaVault_passwords/index/shared_with_groups-index"

        ]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem"]
        Resource = ["arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/RunaVault_audit_log"]
      },
      {
        # Server-side decrypt for CLI/machine-token reads (plaintext=true).
        # The browser continues to decrypt client-side via the Cognito
        # Identity Pool role - this is additive, not a replacement.
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [aws_kms_key.this.arn]
      }
    ]
  })

  allowed_triggers = {
    source_arn = "arn:aws:execute-api:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:${module.runa_vault_api.api_id}/*/*/get_secret"
  }

  environment_variables = {
    USER_POOL_ID     = aws_cognito_user_pool.main.id
    AUDIT_TABLE_NAME = aws_dynamodb_table.audit_log.name
  }
  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_Lambda_GetSecret"
    }
  )
}
