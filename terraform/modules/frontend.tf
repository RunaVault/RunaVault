resource "aws_s3_bucket" "runa_vault_bucket" { #tfsec:ignore:aws-s3-enable-versioning tfsec:ignore:aws-s3-enable-bucket-logging
  bucket = "runavault-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.name}-${random_string.suffix.result}"
  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_S3Bucket"
    }
  )
}
resource "aws_s3_bucket_server_side_encryption_configuration" "react_bucket" { #tfsec:ignore:aws-s3-encryption-customer-key
  bucket = aws_s3_bucket.runa_vault_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

resource "aws_s3_bucket_website_configuration" "react_app_website" {
  bucket = aws_s3_bucket.runa_vault_bucket.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_policy" "react_app_policy" {
  bucket = aws_s3_bucket.runa_vault_bucket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontAccess"
        Effect = "Allow"
        Principal = {
          AWS = aws_cloudfront_origin_access_identity.oai.iam_arn
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.runa_vault_bucket.arn}/*"
      }
    ]
  })
}

# Make bucket private
resource "aws_s3_bucket_public_access_block" "react_app_private" {
  bucket = aws_s3_bucket.runa_vault_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront Origin Access Identity
resource "aws_cloudfront_origin_access_identity" "oai" {
  comment = "OAI for React app"
}

# CloudFront distribution
resource "aws_cloudfront_distribution" "react_app_distribution" { #tfsec:ignore:aws-cloudfront-enable-waf
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = [var.frontend_domain]

  origin {
    domain_name = aws_s3_bucket.runa_vault_bucket.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.runa_vault_bucket.id}"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.oai.cloudfront_access_identity_path
    }
  }
  logging_config {
    include_cookies = false
    bucket          = aws_s3_bucket.logging_bucket.bucket_regional_domain_name
    prefix          = "cloudfront-logs/"
  }

  default_cache_behavior {
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "S3-${aws_s3_bucket.runa_vault_bucket.id}"
    cache_policy_id          = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    origin_request_policy_id = "59781a5b-3903-41f3-afcb-af62929ccde1"

    viewer_protocol_policy     = "redirect-to-https"
    min_ttl                    = 0
    default_ttl                = 0
    max_ttl                    = 0
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id
    compress                   = true
  }

  # Custom error response for SPA
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = var.geo_restriction_type == "none" ? "none" : var.geo_restriction_type
      locations        = var.geo_restriction_type == "none" ? [] : var.geo_restriction_locations
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cloudfront.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_CloudFront"
    }
  )
}

resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name    = "security-headers-policy"
  comment = "Security headers policy for React app"

  security_headers_config {
    strict_transport_security {
      override                   = true
      access_control_max_age_sec = 63072000 # 2 years
      include_subdomains         = true
      preload                    = true
    }

    content_security_policy {
      content_security_policy = "connect-src 'self' https://${var.api_domain} https://cognito-identity.${data.aws_region.current.id}.amazonaws.com https://cognito-idp.${data.aws_region.current.id}.amazonaws.com https://${var.cognito_domain} https://kms.${data.aws_region.current.id}.amazonaws.com https://${var.cognito_domain}; style-src 'self' https://cdn.jsdelivr.net; frame-ancestors https://${var.cognito_domain}; default-src 'none'; img-src 'self' data:; script-src 'self'; object-src 'none'; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-src https://${var.cognito_domain} https://cognito-idp.${data.aws_region.current.id}.amazonaws.com;"
      override                = true
    }

    content_type_options {
      override = true
    }

    xss_protection {
      override   = true
      protection = true
      mode_block = true
    }

    frame_options {
      override     = true
      frame_option = "SAMEORIGIN"
    }

    referrer_policy {
      override        = true
      referrer_policy = "strict-origin-when-cross-origin"
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      override = true
      value    = "geolocation=(), microphone=(), camera=(), payment=()"
    }
  }
}

resource "null_resource" "build_react_app" {
  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    command     = "npm install && npm run build"
    working_dir = "${path.module}/../../frontend"

    environment = {
      REACT_APP_API_GATEWAY_ENDPOINT = "https://${var.api_domain}/"
      REACT_APP_KMS_KEY_ID           = aws_kms_key.this.key_id
      REACT_APP_AWS_REGION           = data.aws_region.current.name
      REACT_APP_COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.app_client.id
      REACT_APP_COGNITO_DOMAIN       = "https://${aws_cognito_user_pool_domain.main.domain}"
      REACT_APP_COGNITO_ID           = aws_cognito_user_pool.main.id
      REACT_APP_LOGOUT_URI           = "https://${var.frontend_domain}/logout"
      REACT_APP_LOGIN_URI            = "https://${var.frontend_domain}/"
      REACT_APP_IDENTITY_POOL_ID     = aws_cognito_identity_pool.main.id
    }
  }
}

resource "null_resource" "deploy_frontend" {
  depends_on = [null_resource.build_react_app]
  triggers = {
    deployment_time = timestamp()
  }

  provisioner "local-exec" {
    command = <<EOT
      aws s3 sync ${path.module}/../../frontend/build s3://${aws_s3_bucket.runa_vault_bucket.id} --delete --region ${data.aws_region.current.name} && \
      aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.react_app_distribution.id} --paths "/*" --region ${data.aws_region.current.name}
    EOT
  }
}


resource "aws_s3_bucket" "logging_bucket" { #tfsec:ignore:aws-s3-enable-versioning tfsec:ignore:aws-s3-enable-bucket-logging tfsec:ignore:aws-s3-encryption-customer-key #NOSONAR
  bucket = "runavault-logging-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.name}-${random_string.suffix.result}"
  tags = merge(
    local.common_tags,
    {
      Name = "RunaVault_Logging_S3Bucket"
    }
  )
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logging_bucket" { #tfsec:ignore:aws-s3-encryption-customer-key
  bucket = aws_s3_bucket.logging_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "logging_bucket_private" {
  bucket = aws_s3_bucket.logging_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
