# Machine/service tokens for CLI and CI/CD access (see backend/authorizer,
# backend/auth_token_create|list|revoke|rotate). Never stores plaintext
# tokens - only a SHA-256 hash, looked up via the token-hash-index GSI on
# every authorized request.
resource "aws_dynamodb_table" "machine_tokens" { #tfsec:ignore:aws-dynamodb-table-customer-key
  name                        = "RunaVault_machine_tokens"
  billing_mode                = "PAY_PER_REQUEST"
  deletion_protection_enabled = true
  server_side_encryption {
    enabled = true
  }
  hash_key  = "owner_id"
  range_key = "token_id"

  attribute {
    name = "owner_id"
    type = "S"
  }

  attribute {
    name = "token_id"
    type = "S"
  }

  attribute {
    name = "token_hash"
    type = "S"
  }

  # Looked up by the dual-mode Lambda authorizer on every machine-token
  # request. Expiry/revocation are always re-checked at authorization time -
  # the table's TTL attribute below is cleanup only, never relied on for
  # security.
  global_secondary_index {
    name            = "token-hash-index"
    hash_key        = "token_hash"
    projection_type = "ALL"
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
      Name = "RunaVault_DynamoDB_MachineTokens"
    }
  )
}
