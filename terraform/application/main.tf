module "runa_vault" {
  source          = "../modules/"
  domain_name     = "runavault.example.com"
  frontend_domain = "runavault.example.com"
  api_domain      = "api.runavault.example.com"
  cognito_domain  = "auth.runavault.example.com"

  geo_restriction_type      = "whitelist"
  geo_restriction_locations = ["UA", "GB"]

  cognito_groups = ["Admin", "Users", "Managers"]
  cognito_users = {
    "admin" = {
      email       = "admin@example.com"
      groups      = ["Admin"]
      given_name  = "Admin"
      family_name = "Admin"
    }
    "user" = {
      email       = "user@example.com"
      groups      = ["Users"]
      given_name  = "User"
      family_name = "User"
    }
    "manager" = {
      email       = "manager@example.com"
      groups      = ["Managers", "Users"]
      given_name  = "Manager"
      family_name = "Manager"
    }
    "alone" = {
      email       = "alone_user@example.com"
      groups      = []
      given_name  = "alone"
      family_name = "user"
    }
  }
}