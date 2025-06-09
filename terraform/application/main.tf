module "runa_vault" {
  source          = "../modules/"
  domain_name     = "runavault.tokarevartem.cloud"
  frontend_domain = "runavault.tokarevartem.cloud"
  api_domain      = "api.runavault.tokarevartem.cloud"
  cognito_domain  = "auth.runavault.tokarevartem.cloud"

  geo_restriction_type      = "whitelist"
  geo_restriction_locations = ["UA", "GB"]

  cognito_groups = ["Admin", "Users", "Managers"]
  cognito_users = {
    "admin" = {
      email       = "enjoy1288@gmail.com"
      groups      = ["Admin"]
      given_name  = "Admin"
      family_name = "Admin"
    }
  }
}
