resource "aws_kms_key" "this" {
  description             = "Kms key for encrypting secrets"
  key_usage               = "ENCRYPT_DECRYPT"
  enable_key_rotation     = true
  deletion_window_in_days = 20
  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "key-default-1"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        },
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow cognito authenticated role to use the key"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.cognito_authenticated_role.arn
        },
        Action   = ["kms:Encrypt", "kms:Decrypt"]
        Resource = "*"
      }
    ]
  })
  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_KMSKey"
    }
  )
}

resource "aws_kms_alias" "alias" {
  name          = "alias/RunaVault"
  target_key_id = aws_kms_key.this.key_id
}
