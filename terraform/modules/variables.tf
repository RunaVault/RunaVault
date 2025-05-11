variable "cognito_users" {
  description = "Map of users with their attributes and group assignments"
  type = map(object({
    email       = string
    groups      = list(string)
    given_name  = string
    family_name = string
  }))
  default = {}
}

variable "cognito_groups" {
  description = "List of Cognito groups to create"
  type        = list(string)
  default     = []
}

variable "domain_name" {
  description = "The main domain name (e.g., example.com)"
  type        = string
}

variable "cognito_domain" {
  description = "The subdomain for Cognito (e.g., auth.example.com)"
  type        = string
}

variable "api_domain" {
  description = "The subdomain for API Gateway (e.g., api.example.com)"
  type        = string
}

variable "frontend_domain" {
  description = "The subdomain for frontend (e.g., app.example.com or www.example.com)"
  type        = string
}

variable "geo_restriction_type" {
  description = "Type of geo restriction (none, whitelist, blacklist)"
  type        = string
  default     = "none"
  validation {
    condition     = contains(["none", "whitelist", "blacklist"], var.geo_restriction_type)
    error_message = "Geo restriction type must be one of: none, whitelist, blacklist"
  }
}

variable "geo_restriction_locations" {
  description = "List of ISO country codes for geo restriction (required if restriction_type is not none)"
  type        = list(string)
  default     = []

  validation {
    condition     = var.geo_restriction_type == "none" || length(var.geo_restriction_locations) > 0
    error_message = "At least one location must be specified when geo restriction is enabled"
  }
}