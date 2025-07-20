```hcl
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
```
<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_archive"></a> [archive](#requirement\_archive) | ~> 2.7 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.0 |
| <a name="requirement_null"></a> [null](#requirement\_null) | ~> 3.2 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.7 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_archive"></a> [archive](#provider\_archive) | ~> 2.7 |
| <a name="provider_aws"></a> [aws](#provider\_aws) | ~> 5.0 |
| <a name="provider_aws.us-east-1"></a> [aws.us-east-1](#provider\_aws.us-east-1) | ~> 5.0 |
| <a name="provider_null"></a> [null](#provider\_null) | ~> 3.2 |
| <a name="provider_random"></a> [random](#provider\_random) | ~> 3.7 |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_api_domain"></a> [api\_domain](#input\_api\_domain) | The subdomain for API Gateway (e.g., api.example.com) | `string` | n/a | yes |
| <a name="input_cognito_domain"></a> [cognito\_domain](#input\_cognito\_domain) | The subdomain for Cognito (e.g., auth.example.com) | `string` | n/a | yes |
| <a name="input_cognito_groups"></a> [cognito\_groups](#input\_cognito\_groups) | List of Cognito groups to create | `list(string)` | `[]` | no |
| <a name="input_cognito_users"></a> [cognito\_users](#input\_cognito\_users) | Map of users with their attributes and group assignments | <pre>map(object({<br/>    email       = string<br/>    groups      = list(string)<br/>    given_name  = string<br/>    family_name = string<br/>  }))</pre> | `{}` | no |
| <a name="input_domain_name"></a> [domain\_name](#input\_domain\_name) | The main domain name (e.g., example.com) | `string` | n/a | yes |
| <a name="input_frontend_domain"></a> [frontend\_domain](#input\_frontend\_domain) | The subdomain for frontend (e.g., app.example.com or www.example.com) | `string` | n/a | yes |
| <a name="input_geo_restriction_locations"></a> [geo\_restriction\_locations](#input\_geo\_restriction\_locations) | List of ISO country codes for geo restriction (required if restriction\_type is not none) | `list(string)` | `[]` | no |
| <a name="input_geo_restriction_type"></a> [geo\_restriction\_type](#input\_geo\_restriction\_type) | Type of geo restriction (none, whitelist, blacklist) | `string` | `"none"` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_api_gateway_invoke_url"></a> [api\_gateway\_invoke\_url](#output\_api\_gateway\_invoke\_url) | n/a |
| <a name="output_cloudfront_domain_name"></a> [cloudfront\_domain\_name](#output\_cloudfront\_domain\_name) | n/a |
| <a name="output_identity_pool_id"></a> [identity\_pool\_id](#output\_identity\_pool\_id) | n/a |
| <a name="output_s3_bucket_name"></a> [s3\_bucket\_name](#output\_s3\_bucket\_name) | n/a |
| <a name="output_user_pool_client_id"></a> [user\_pool\_client\_id](#output\_user\_pool\_client\_id) | n/a |
| <a name="output_user_pool_id"></a> [user\_pool\_id](#output\_user\_pool\_id) | n/a |
<!-- END_TF_DOCS -->