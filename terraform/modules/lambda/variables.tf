variable "function_name" {
  description = "The name of the Lambda function"
  type        = string
}

variable "description" {
  description = "Description of the Lambda function"
  type        = string
  default     = ""
}

variable "layers" {
  description = "Lambda layers to attach to the function"
  type        = list(any)
}

variable "source_path" {
  description = "Path to the Lambda function source code"
  type        = string
  default     = null
}

variable "policy_json" {
  description = "IAM policy JSON for the Lambda function"
  type        = string
}

variable "allowed_triggers" {
  description = "Map of allowed triggers for the Lambda function"
  type = object({
    source_arn = string
  })
  default = null
}

variable "environment_variables" {
  description = "Environment variables for the Lambda function"
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}

variable "log_retention_in_days" {
  description = "Number of days to retain logs in CloudWatch Logs"
  type        = number
  default     = 30
}

variable "memory_size" {
  description = "Amount of memory in MB to allocate to the Lambda function"
  type        = number
  default     = 128
}

variable "timeout" {
  description = "Timeout in seconds for the Lambda function"
  type        = number
  default     = 3
}