resource "aws_iam_role" "lambda_role" {
  name = "RunaVault_${var.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
  tags = merge(
    var.tags,
    {
      Name = "RunaVault_${var.function_name}_IAMRole"
    }
  )
}

resource "aws_iam_role_policy" "lambda_policy" {
  name   = "RunaVault_${var.function_name}-policy"
  role   = aws_iam_role.lambda_role.id
  policy = var.policy_json
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "../../backend/${var.function_name}"
  output_path = "${path.module}/${var.function_name}.zip"
  excludes    = ["${var.function_name}.zip"]
}

resource "aws_lambda_function" "lambda" { #tfsec:ignore:aws-lambda-enable-tracing
  function_name = "RunaVault_${var.function_name}"
  description   = var.description
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  role          = aws_iam_role.lambda_role.arn
  publish       = true
  timeout       = var.timeout
  memory_size   = var.memory_size
  filename      = data.archive_file.lambda.output_path
  architectures = ["arm64"]
  layers        = var.layers

  source_code_hash = data.archive_file.lambda.output_base64sha256

  environment {
    variables = var.environment_variables
  }

  tags = merge(
    var.tags,
    {
      Name = "RunaVault_${var.function_name}"
    }
  )
}

resource "aws_lambda_permission" "api_gateway_invoke" {
  count = var.allowed_triggers != null ? 1 : 0

  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = var.allowed_triggers.source_arn
}

resource "aws_iam_role_policy" "lambda_cloudwatch_logs" {
  name = "${var.function_name}-cloudwatch-logs-policy"
  role = aws_iam_role.lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.function_name}:*"]
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "lambda_log_group" { #tfsec:ignore:aws-cloudwatch-log-group-customer-key
  name              = "/aws/lambda/RunaVault_${var.function_name}"
  retention_in_days = var.log_retention_in_days
  tags = merge(
    var.tags,
    {
      Name = "RunaVault_${var.function_name}_LogGroup"
    }
  )
}
