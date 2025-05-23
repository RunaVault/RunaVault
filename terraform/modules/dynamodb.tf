resource "aws_dynamodb_table" "passwords" {
  name                        = "RunaVault_passwords"
  billing_mode                = "PAY_PER_REQUEST"
  deletion_protection_enabled = true

  hash_key  = "user_id"
  range_key = "site"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "site"
    type = "S"
  }

  attribute {
    name = "shared_with_groups"
    type = "S"
  }

  attribute {
    name = "shared_with_users"
    type = "S"
  }

  # Global Secondary Index (GSI) for group-based access
  global_secondary_index {
    name            = "shared_with_groups-index"
    hash_key        = "shared_with_groups"
    projection_type = "ALL"
  }

  # Global Secondary Index (GSI) for user-based access
  global_secondary_index {
    name            = "shared_with_users-index"
    hash_key        = "shared_with_users"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_DynamoDB_Passwords"
    }
  )
}
