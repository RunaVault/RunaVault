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
  description = "Whether to create an authorizer"
  type        = bool
  default     = false
}

variable "authorizer_type" {
  description = "Authorizer type: \"JWT\" (native Cognito JWT authorizer) or \"REQUEST\" (Lambda authorizer, e.g. the dual-mode Cognito/machine-token authorizer)"
  type        = string
  default     = "JWT"
  validation {
    condition     = contains(["JWT", "REQUEST"], var.authorizer_type)
    error_message = "authorizer_type must be either \"JWT\" or \"REQUEST\"."
  }
}

variable "authorizer_identity_sources" {
  description = "Identity sources for the authorizer"
  type        = list(string)
  default     = ["$request.header.Authorization"]
}

variable "authorizer_name" {
  description = "Name of the authorizer"
  type        = string
  default     = "cognito"
}

variable "authorizer_audience" {
  description = "Audience for the JWT authorizer (authorizer_type = \"JWT\" only)"
  type        = list(string)
  default     = []
}

variable "authorizer_issuer" {
  description = "Issuer for the JWT authorizer (authorizer_type = \"JWT\" only)"
  type        = string
  default     = ""
}

variable "authorizer_uri" {
  description = "Lambda invoke ARN for the authorizer (authorizer_type = \"REQUEST\" only)"
  type        = string
  default     = ""
}

variable "authorizer_result_ttl_in_seconds" {
  description = "How long API Gateway may cache a REQUEST authorizer's decision. Kept at 0 so token revocation takes effect immediately."
  type        = number
  default     = 0
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

variable "throttling_burst_limit" {
  description = "Default per-stage burst throttle limit (API Gateway account/stage level; a WAFv2 Web ACL is recommended in addition for production)"
  type        = number
  default     = 50
}

variable "throttling_rate_limit" {
  description = "Default per-stage steady-state throttle limit (requests/second)"
  type        = number
  default     = 25
}
