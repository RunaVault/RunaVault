variable "api_name" {
  description = "The name of the API Gateway"
  type        = string
}

variable "api_description" {
  description = "The description of the API Gateway"
  type        = string
  default     = ""
}

variable "cors_allow_headers" {
  description = "List of headers allowed in CORS requests"
  type        = list(string)
  default     = ["content-type", "x-amz-date", "authorization", "x-api-key", "x-amz-security-token", "x-amz-user-agent"]
}

variable "cors_allow_methods" {
  description = "List of methods allowed in CORS requests"
  type        = list(string)
  default     = ["*"]
}

variable "cors_allow_origins" {
  description = "List of origins allowed in CORS requests"
  type        = list(string)
  default     = ["*"]
}

variable "tags" {
  description = "Tags to apply to the API Gateway"
  type        = map(string)
  default     = {}
}

variable "create_authorizer" {
  description = "Whether to create a JWT authorizer"
  type        = bool
  default     = false
}

variable "authorizer_identity_sources" {
  description = "Identity sources for the JWT authorizer"
  type        = list(string)
  default     = ["$request.header.Authorization"]
}

variable "authorizer_name" {
  description = "Name of the JWT authorizer"
  type        = string
  default     = "cognito"
}

variable "authorizer_audience" {
  description = "Audience for the JWT authorizer"
  type        = list(string)
  default     = []
}

variable "authorizer_issuer" {
  description = "Issuer for the JWT authorizer"
  type        = string
  default     = ""
}

variable "integrations" {
  description = "Map of integrations for the API Gateway"
  type = map(object({
    method = string
    uri    = string
  }))
  default = {}
}

variable "routes" {
  description = "Map of routes for the API Gateway"
  type = map(object({
    integration_key = string
  }))
  default = {}
}

variable "stage_name" {
  description = "Name of the API Gateway stage"
  type        = string
  default     = "$default"
}
variable "api_domain" {
  description = "Custom domain name for the API Gateway"
  type        = string
  default     = ""
}
variable "certificate_arn" {
  description = "ARN of the ACM certificate for the custom domain"
  type        = string
  default     = ""
}
