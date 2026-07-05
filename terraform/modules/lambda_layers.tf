locals {
  lambda_source_dir = "${path.module}/../../backend/layers/nodejs"
  layer_zip_path    = "${path.module}/../../backend/layers/nodejs/layer.zip"
  # Hash of package-lock.json so the layer rebuilds only when dependencies change
  layer_deps_hash = filemd5("${path.module}/../../backend/layers/nodejs/package-lock.json")
}

# Run npm install before zipping so node_modules is present in the archive
resource "null_resource" "layer_npm_install" {
  triggers = {
    deps_hash = local.layer_deps_hash
  }

  provisioner "local-exec" {
    command     = "npm ci --omit=dev"
    working_dir = local.lambda_source_dir
  }
}

data "archive_file" "lambda_layer" {
  type        = "zip"
  source_dir  = local.lambda_source_dir
  output_path = local.layer_zip_path
  excludes    = ["layer.zip"]

  depends_on = [null_resource.layer_npm_install]
}

resource "aws_lambda_layer_version" "nodejs_common_layer" {
  layer_name          = "nodejs-common-layer"
  description         = "Lambda Layer for common Node.js modules (jsonwebtoken, jwks-rsa)"
  filename            = data.archive_file.lambda_layer.output_path
  source_code_hash    = data.archive_file.lambda_layer.output_base64sha256
  compatible_runtimes = ["nodejs24.x"]
}
