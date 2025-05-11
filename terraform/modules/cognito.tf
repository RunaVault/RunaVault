resource "aws_cognito_user_pool_domain" "main" {
  depends_on      = [aws_cloudfront_distribution.react_app_distribution, aws_acm_certificate.cloudfront, aws_route53_record.frontend]
  domain          = var.cognito_domain
  user_pool_id    = aws_cognito_user_pool.main.id
  certificate_arn = aws_acm_certificate.cloudfront.arn
}

resource "aws_cognito_user_pool" "main" {
  name                     = "RunaVault-user-pool"
  auto_verified_attributes = ["email"]
  username_attributes      = ["email"]
  mfa_configuration        = "ON"

  software_token_mfa_configuration {
    enabled = true
  }
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
  schema {
    attribute_data_type      = "String"
    name                     = "email"
    mutable                  = false
    developer_only_attribute = false
    required                 = false
    string_attribute_constraints {
      min_length = 0
      max_length = 2048
    }
  }
  schema {
    attribute_data_type      = "String"
    name                     = "given_name"
    mutable                  = true
    developer_only_attribute = false
    required                 = false
    string_attribute_constraints {
      min_length = 0
      max_length = 256
    }
  }
  schema {
    attribute_data_type      = "String"
    name                     = "family_name"
    mutable                  = true
    developer_only_attribute = false
    required                 = false
    string_attribute_constraints {
      min_length = 0
      max_length = 256
    }
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_LINK"
    email_subject        = "Welcome to RunaVault - Reset Password Your Account"
    email_message        = <<EOF
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reset Password Your RunaVault Account</title>
  <style type="text/css">
    body {
      line-height: 1.5;
      color: #333333;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #ffffff;
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 1px solid #eeeeee;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
    }
    .content {
      padding: 20px 0;
    }
    .button {
      display: inline-block;
      padding: 10px 20px;
      margin: 20px 0;
      background-color: #0366d6;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 4px;
      font-weight: bold;
    }
    .footer {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #eeeeee;
      font-size: 12px;
      color: #777777;
    }
    .password-box {
      background-color: #f5f5f5;
      border: 1px solid #dddddd;
      border-radius: 4px;
      padding: 10px 15px;
      margin: 15px 0;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">RunaVault</div>
    </div>
    <div class="content">
      <h2>Hello!</h2>
      <p>Welcome to RunaVault!</p>
      <p>Copy and paste this code into the code field:</p>
      <div class="password-box"><strong>{####}</strong></div>
      <p>If you didn't request this, please ignore this email.</p>
    </div>
    <div class="footer">
      <p>This is an automated message, please do not reply to this email.</p>
      <p>&copy; RunaVault. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
EOF
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
    invite_message_template {
      email_subject = "Welcome to RunaVault - Your Account Details"
      email_message = <<EOF
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Welcome to RunaVault</title>
  <style type="text/css">
    body {
      line-height: 1.5;
      color: #333333;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #ffffff;
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 1px solid #eeeeee;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
    }
    .content {
      padding: 20px 0;
    }
    .password-box {
      background-color: #f5f5f5;
      border: 1px solid #dddddd;
      border-radius: 4px;
      padding: 10px 15px;
      margin: 15px 0;
      font-size: 16px;
    }
    .info-block {
      margin: 20px 0;
      padding: 15px;
      background-color: #e8f5e9;
      border-left: 5px solid #4caf50;
      border-radius: 4px;
    }
    .button {
      display: inline-block;
      padding: 10px 20px;
      margin: 20px 0;
      background-color: #0366d6;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 4px;
      font-weight: bold;
    }
    .footer {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #eeeeee;
      font-size: 12px;
      color: #777777;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">RunaVault</div>
    </div>
    <div class="content">
      <h2>Hello {username},</h2>
      <p>Welcome to RunaVault! Your account has been created successfully.</p>
      
      <p>Here are your temporary login credentials:</p>
      <div class="password-box">
        <p><strong>Username:</strong> {username}</p>
        <p><strong>Temporary Password:</strong> {####}</p>
      </div>
      
      <div class="info-block">
        <p><strong>Important:</strong> You will be asked to change your password when you first log in.</p>
      </div>
      
      <p>You can log in at:</p>
      <a href="https://${var.frontend_domain}" class="button">Log In Now</a>
      
      <p>or visit: <a href="https://${var.frontend_domain}">https://${var.frontend_domain}</a></p>
      
      <p>If you have any questions, please contact your administrator.</p>
    </div>
    <div class="footer">
      <p>This is an automated message, please do not reply to this email.</p>
      <p>&copy; RunaVault. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
EOF
      sms_message   = "Welcome to RunaVault! Your username is {username}. Use this code to verify: {####}"
    }
  }

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_CognitoUserPool"
    }
  )
}

resource "aws_cognito_user_pool_client" "app_client" {
  name         = "client"
  user_pool_id = aws_cognito_user_pool.main.id

  explicit_auth_flows = [
    "ALLOW_USER_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
  ]

  allowed_oauth_flows                  = ["code", "implicit"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  callback_urls                        = ["https://${var.frontend_domain}/"]
  logout_urls                          = ["https://${var.frontend_domain}/logout"]
  supported_identity_providers         = ["COGNITO"]
  access_token_validity                = 60
  id_token_validity                    = 60
  refresh_token_validity               = 5

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_identity_pool" "main" {
  identity_pool_name               = "RunaVaultIdentityPool"
  allow_unauthenticated_identities = false

  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.app_client.id
    provider_name           = aws_cognito_user_pool.main.endpoint
    server_side_token_check = false
  }

  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_CognitoIdentityPool"
    }
  )
}

resource "aws_iam_role" "cognito_authenticated_role" {
  name = "RunaVault_CognitoAuthenticatedRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.main.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "authenticated"
          }
        }
      }
    ]
  })

  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_CognitoAuthenticatedRole"
    }
  )
}

resource "aws_iam_role_policy" "cognito_authenticated_policy" {
  name = "RunaVault_CognitoAuthenticatedPolicy"
  role = aws_iam_role.cognito_authenticated_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
        ]
        Resource = [
          "arn:aws:kms:us-east-1:339713181866:key/a5ffd96a-8d3f-4a45-8cdb-11dd9ea7d079"
        ]
      }
    ]
  })
}

resource "aws_cognito_identity_pool_roles_attachment" "main" {
  identity_pool_id = aws_cognito_identity_pool.main.id

  roles = {
    "authenticated" = aws_iam_role.cognito_authenticated_role.arn
  }
}

# Create Cognito User Groups
resource "aws_cognito_user_group" "groups" {
  for_each = toset(var.cognito_groups)

  name         = each.value
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Group ${each.value} for RunaVault"
}

resource "aws_cognito_user" "users" {
  for_each = var.cognito_users

  user_pool_id = aws_cognito_user_pool.main.id
  username     = each.value.email
  attributes = {
    email          = each.value.email
    given_name     = each.value.given_name
    family_name    = each.value.family_name
    email_verified = "true"
  }
}

resource "aws_cognito_user_in_group" "user_group_membership" {
  for_each = merge([
    for username, user in var.cognito_users : {
      for group in user.groups :
      "${username}-${group}" => {
        username = username
        group    = group
      }
    }
  ]...)

  user_pool_id = aws_cognito_user_pool.main.id
  group_name   = each.value.group
  username     = aws_cognito_user.users[each.value.username].username

  depends_on = [
    aws_cognito_user_group.groups,
    aws_cognito_user.users
  ]
}

resource "aws_cognito_user_pool_ui_customization" "this" {
  depends_on   = [aws_cognito_user_pool_domain.main]
  client_id    = "ALL"
  css          = ".label-customizable {font-weight: 400;}"
  user_pool_id = aws_cognito_user_pool.main.id
}
