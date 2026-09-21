# Audit trail for machine-token usage (spec: who accessed what, when, from
# where). Kept separate from both the secrets table and the machine-tokens
# table. Never contains token or secret plaintext - see
# backend/layers/nodejs/authz.js writeAuditLog().
resource "aws_dynamodb_table" "audit_log" { #tfsec:ignore:aws-dynamodb-table-customer-key
  name                        = "RunaVault_audit_log"
  billing_mode                = "PAY_PER_REQUEST"
  deletion_protection_enabled = true
  server_side_encryption {
    enabled = true
  }
  hash_key  = "subject_id"
  range_key = "event_id"

  attribute {
    name = "subject_id"
    type = "S"
  }

  attribute {
    name = "event_id"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_DynamoDB_AuditLog"
    }
  )
}
