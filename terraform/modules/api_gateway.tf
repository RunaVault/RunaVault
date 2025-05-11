module "runa_vault_api" {
  depends_on = [aws_route53_record.frontend]
  source     = "../modules/api_gateway/"

  api_name        = "RunaVault-api"
  api_description = "RunaVault API Gateway"

  create_authorizer   = true
  authorizer_audience = [aws_cognito_user_pool_client.app_client.id]
  authorizer_issuer   = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  cors_allow_origins  = ["https://${var.frontend_domain}"]
  cors_allow_methods  = ["OPTIONS", "GET", "POST"]
  api_domain          = var.api_domain
  certificate_arn     = aws_acm_certificate.regional.arn
  integrations = {
    create_secret = {
      method = "POST"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_create_secret"
    }
    delete_secret = {
      method = "POST"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_delete_secret"
    }
    edit_secret = {
      method = "POST"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_edit_secret"
    }
    get_secret = {
      method = "POST"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_get_secret"
    }
    list_secrets = {
      method = "GET"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_list_secrets"
    }
    list_users = {
      method = "GET"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_list_users"
    }
    create_user = {
      method = "POST"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_create_user"
    }
    list_groups = {
      method = "GET"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_list_groups"
    }
    add_user_to_groups = {
      method = "POST"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_add_user_to_groups"
    }
    edit_users = {
      method = "POST"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_edit_users"
    }
    list_user_groups = {
      method = "POST"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_list_user_groups"
    }
    remove_user_from_groups = {
      method = "POST"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_remove_user_from_groups"
    }
    delete_group = {
      method = "POST"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_delete_group"
    }
    create_group = {
      method = "POST"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_create_group"
    }
    share_directory = {
      method = "POST"
      uri    = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:RunaVault_share_directory"
    }
  }

  routes = {
    "POST /create_secret" = {
      integration_key = "create_secret"
    }
    "POST /delete_secret" = {
      integration_key = "delete_secret"
    }
    "POST /edit_secret" = {
      integration_key = "edit_secret"
    }
    "POST /get_secret" = {
      integration_key = "get_secret"
    }
    "GET /list_secrets" = {
      integration_key = "list_secrets"
    }
    "GET /list_users" = {
      integration_key = "list_users"
    }
    "POST /create_user" = {
      integration_key = "create_user"
    }
    "GET /list_groups" = {
      integration_key = "list_groups"
    }
    "POST /add_user_to_groups" = {
      integration_key = "add_user_to_groups"
    }
    "POST /edit_users" = {
      integration_key = "edit_users"
    }
    "POST /list_user_groups" = {
      integration_key = "list_user_groups"
    }
    "POST /delete_group" = {
      integration_key = "delete_group"
    }
    "POST /create_group" = {
      integration_key = "create_group"
    }
    "POST /share_directory" = {
      integration_key = "share_directory"
    }
    "POST /remove_user_from_groups" = {
      integration_key = "remove_user_from_groups"
    }
  }

  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_API"
    }
  )
}

