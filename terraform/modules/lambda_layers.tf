locals {
  lambda_source_dir = "${path.module}/../../backend/layers/nodejs"
  layer_zip_path    = "${local.lambda_source_dir}/layer.zip"
}

data "archive_file" "lambda_layer" {
  type        = "zip"
  source_dir  = local.lambda_source_dir
  output_path = local.layer_zip_path
  excludes    = ["layer.zip"]
}

resource "aws_lambda_layer_version" "nodejs_common_layer" {
  layer_name          = "nodejs-common-layer"
  description         = "Lambda Layer for common Node.js modules (jsonwebtoken, jwks-rsa)"
  filename            = data.archive_file.lambda_layer.output_path
  compatible_runtimes = ["nodejs22.x"]
}