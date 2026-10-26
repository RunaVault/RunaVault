# AGENTS.md — RunaVault AI Coding Agent Instructions

## Project Overview

RunaVault is a self-hosted, serverless password manager built on AWS.

The application allows authenticated users to securely create, store, manage, and share encrypted secrets with other users or groups.

The main architecture is:

```text
React/Vite Frontend
        |
        v
CloudFront + S3
        |
        v
API Gateway
        |
        v
AWS Lambda
   |         |
   v         v
DynamoDB   Cognito
   |
   v
Encrypted Secrets

Frontend
   |
   v
Cognito Identity Pool
   |
   v
AWS KMS
```

Infrastructure is managed using Terraform.

Primary AWS services:

* Amazon Cognito
* Amazon Cognito Identity Pool
* API Gateway
* AWS Lambda
* DynamoDB
* AWS KMS
* S3
* CloudFront
* ACM
* Route 53

The project is designed to be deployable with low AWS costs and to remain suitable for small self-hosted deployments.

---

# Repository Structure

```text
.
├── backend/
│   ├── __tests__/
│   │   └── <function_name>.test.js
│   ├── layers/
│   │   └── nodejs/
│   │       └── utils.js
│   ├── <lambda_function>/
│   │   ├── index.js
│   │   └── package.json
│   ├── jest.config.cjs
│   └── package.json
│
├── frontend/
│   ├── src/
│   ├── build/
│   ├── package.json
│   └── vite.config.js
│
├── terraform/
│   ├── application/
│   │   └── main.tf
│   └── modules/
│       ├── lambda_*.tf
│       ├── api_gateway.tf
│       ├── dynamodb.tf
│       ├── cognito.tf
│       ├── kms.tf
│       ├── cloudfront.tf
│       └── ...
│
├── .github/
│   └── workflows/
│
├── AGENTS.md
├── CONTRIBUTION.md
├── CHANGELOG.md
└── README.md
```

Do not introduce a new top-level directory without first checking whether an existing directory is intended for that responsibility.

---

# General Agent Rules

## Before changing code

1. Read the relevant existing implementation.
2. Read the related tests.
3. Check the Terraform resources if the change affects AWS infrastructure.
4. Check the shared Lambda layer if changing authentication, request parsing, sanitization, or responses.
5. Keep changes narrowly scoped.
6. Do not rewrite unrelated code.
7. Preserve existing architectural patterns unless there is a strong reason to change them.

Prefer small, reviewable changes over large refactors.

---

# Technology Stack

## Frontend

* React 19
* Vite
* JavaScript
* JSX inside `.js` files
* react-oidc-context
* react-select
* FontAwesome
* AWS SDK

The frontend is intentionally JavaScript-based.

Do not introduce TypeScript unless explicitly requested.

## Backend

* AWS Lambda
* Node.js
* AWS SDK v3
* DynamoDB
* Cognito
* Jest
* aws-sdk-client-mock

Each Lambda should normally expose:

```javascript
export const handler = async (event) => {
    // ...
};
```

## Infrastructure

* Terraform
* AWS provider
* OpenTofu may be used as an alternative

Terraform is the source of truth for infrastructure.

Do not manually create AWS resources when an equivalent Terraform resource exists.

---

# Backend Lambda Pattern

Lambda functions should follow the existing security and response pattern.

Typical request flow:

```text
API Gateway
    |
    v
Cognito JWT
    |
    v
getAuthToken()
    |
    v
verifyToken()
    |
    v
parseBody()
    |
    v
sanitizeString()/sanitizeObject()
    |
    v
Business logic
    |
    v
DynamoDB / Cognito
    |
    v
formatResponse()
```

Use the shared utilities from:

```text
backend/layers/nodejs/utils.js
```

The shared layer currently provides utilities including:

* `getAuthToken`
* `verifyToken`
* `parseBody`
* `formatResponse`
* `sanitizeString`
* `sanitizeObject`

Do not duplicate these utilities inside individual Lambda functions.

---

# Authentication

Authentication is based on Amazon Cognito.

Every protected Lambda request must validate the Cognito JWT.

Do not:

* trust a user ID supplied by the request body
* skip JWT validation
* assume API Gateway authentication alone is sufficient
* bypass `verifyToken()` for convenience

When determining the current user, prefer the identity contained in the validated token.

Never allow a request parameter to override the authenticated identity.

**Exception - the dual-mode authorizer.** `backend/authorizer/index.js` is a Lambda REQUEST authorizer that verifies the Cognito JWT (or a `rv_live_...` machine token - see `docs/machine-authentication.md`) once, before any other Lambda runs, and attaches the result as `{ authType, userId, groups, scopes, allowedSecretPaths, tokenId }` on `event.requestContext.authorizer.lambda`. `get_secret` and `list_secrets` read this via `getAuthContext()` (`backend/layers/nodejs/authz.js`) instead of calling `verifyToken()`/`getAuthToken()` themselves - this is intentional, not a shortcut, since the authorizer has already done that verification and machine tokens aren't JWTs at all. Every other handler is unaffected and still independently verifies the raw Cognito JWT itself, exactly as described above. If you add a new secret-related endpoint that machine tokens should be able to call, use `getAuthContext()` + `requireScope()`/`isSecretPathAllowed()` from `authz.js` rather than reimplementing these checks.

---

# Authorization

Authentication and authorization are separate concerns.

A valid Cognito token does not automatically mean that the user is authorized to perform every operation.

For operations involving:

* secrets
* sharing
* users
* groups
* administration

verify that the authenticated user has permission to perform the requested action.

Pay particular attention to:

```text
Admin
Viewer
Editor
Owner
```

Do not introduce authorization shortcuts such as:

```javascript
if (event.body.userId === requestedUserId)
```

without verifying that the authenticated identity is actually allowed to operate on the resource.

---

# Secret Security

RunaVault handles sensitive credentials.

Security takes priority over convenience.

Passwords and other secrets must remain encrypted.

The intended architecture encrypts secret data client-side using AWS KMS before sensitive data is stored by the backend.

Do not introduce changes that cause plaintext passwords or secret values to be unnecessarily:

* logged
* returned in API responses
* stored in DynamoDB
* stored in browser local storage
* stored in cookies
* written to files
* included in error messages

Never add debugging such as:

```javascript
console.log(secret);
console.log(password);
console.log(event);
```

to production code.

If debugging sensitive functionality, log metadata rather than secret values.

For example:

```javascript
console.log({
    operation: "createSecret",
    userId,
});
```

rather than logging the request body.

---

# AWS KMS

KMS is part of the application's encryption architecture.

Before modifying encryption-related code:

1. Understand whether encryption happens in the browser or backend.
2. Check how Cognito Identity Pool credentials are obtained.
3. Check the KMS key policy.
4. Check IAM permissions.
5. Verify whether the change affects existing encrypted data.

Do not change encryption algorithms, key usage, ciphertext formats, or KMS permissions without considering backward compatibility.

Never hard-code:

* AWS access keys
* AWS secret keys
* KMS credentials
* Cognito secrets
* private keys

---

# DynamoDB

DynamoDB stores application data and encrypted secret metadata.

The table prefix is controlled by:

```text
TABLE_PREFIX
```

The default prefix is:

```text
RunaVault_
```

When modifying DynamoDB access:

* use the existing AWS SDK v3 patterns
* preserve existing key structures
* avoid full table scans where possible
* use appropriate `Query` operations when a partition key is available
* avoid changing attribute names without considering existing data
* maintain compatibility with existing records

Do not introduce a schema migration implicitly.

If a data-model change is required, document the migration strategy.

---

# Input Validation and Sanitization

All user-controlled input must be treated as untrusted.

Use the existing shared sanitization utilities:

```text
sanitizeString()
sanitizeObject()
```

Do not store raw user input directly in DynamoDB when the existing sanitization layer is applicable.

Validate:

* required fields
* string lengths
* identifiers
* enum values
* permissions
* resource ownership
* pagination parameters
* API request structure

Never rely exclusively on frontend validation.

Frontend validation improves UX.

Backend validation provides security.

---

# API Responses

Use the shared:

```text
formatResponse()
```

helper for Lambda responses.

Do not create inconsistent response formats without a clear reason.

Do not expose:

* stack traces
* internal AWS errors
* secrets
* tokens
* IAM information
* internal infrastructure details

to clients.

---

# CORS

The existing `formatResponse()` implementation controls CORS behavior.

Do not casually change CORS configuration.

Before modifying CORS:

1. Understand the frontend origin.
2. Check API Gateway configuration.
3. Check CloudFront configuration.
4. Check whether Terraform also defines CORS behavior.

Avoid broadening access as a quick fix for frontend errors.

---

# Frontend Rules

The frontend is a React/Vite application.

`.js` files may contain JSX.

Follow the existing component and hook patterns.

Prefer:

```javascript
useState
useEffect
useCallback
```

and the existing application patterns rather than introducing a new state-management framework.

Do not introduce:

* Redux
* Zustand
* MobX
* TypeScript
* a new UI framework

unless explicitly requested.

---

# Frontend Environment Variables

Frontend environment variables use the `VITE_` prefix.

Examples include:

```text
VITE_AWS_REGION
VITE_KMS_KEY_ID
VITE_IDENTITY_POOL_ID
VITE_COGNITO_ID
```

Never put actual secrets in `VITE_*` variables.

Important:

Vite environment variables are exposed to browser-side JavaScript.

Anything placed in a `VITE_*` variable should therefore be considered public.

---

# Frontend Build

The repository currently commits:

```text
frontend/build/
```

This is intentional because the Terraform deployment uses the generated frontend build.

After changing frontend source code:

```bash
cd frontend
npm run build
```

The resulting `frontend/build/` changes should be included in the PR.

Do not manually edit files inside `frontend/build/`.

Always regenerate the build from source.

---

# Terraform

Terraform lives under:

```text
terraform/
```

The application entry point is:

```text
terraform/application/
```

The reusable AWS resources are primarily under:

```text
terraform/modules/
```

Typical workflow:

```bash
cd terraform/application

terraform init
terraform validate
terraform plan
terraform apply
```

OpenTofu can be used where appropriate:

```bash
tofu init
tofu validate
tofu plan
tofu apply
```

Before changing Terraform:

1. Identify dependencies between resources.
2. Check IAM permissions.
3. Check environment-specific variables.
4. Check whether the change affects existing production resources.
5. Run `terraform validate`.
6. Run `terraform plan` when possible.

Never blindly use:

```bash
terraform destroy
```

Never remove an AWS resource from Terraform merely to make a plan succeed.

---

# IAM

Follow least privilege.

When adding a new AWS API call:

1. Identify the exact AWS permission required.
2. Add only the required action.
3. Restrict the resource ARN where practical.
4. Avoid `*` resources unless required by AWS or the existing architecture.

Avoid broad policies such as:

```text
Action = "*"
Resource = "*"
```

unless there is a documented technical reason.

---

# Adding a New Lambda

When adding a Lambda function:

1. Create:

```text
backend/<function_name>/index.js
```

2. Create:

```text
backend/<function_name>/package.json
```

3. Add tests:

```text
backend/__tests__/<function_name>.test.js
```

4. Add the Terraform resource:

```text
terraform/modules/lambda_<function_name>.tf
```

5. Register the API route in:

```text
terraform/modules/api_gateway.tf
```

6. Configure required IAM permissions.

7. Add environment variables through Terraform rather than hard-coding them.

8. Add tests for authentication and authorization.

9. Run the full backend test suite.

---

# Testing

Backend tests use Jest.

Run:

```bash
cd backend
npm install
npm test
```

Watch mode:

```bash
npm run test:watch
```

Coverage thresholds are intentionally enforced.

The global target is approximately:

```text
80%
```

for:

* branches
* functions
* lines
* statements

Check `jest.config.cjs` before assuming every file has identical thresholds.

Tests are intentionally configured to run serially.

Do not re-enable parallel execution without understanding possible mock-state leakage.

---

# Lambda Test Mocking

Tests should mock:

```text
/opt/utils.js
```

as a virtual module following the existing project pattern.

AWS SDK clients should be mocked using:

```text
aws-sdk-client-mock
```

Do not make real AWS API calls from unit tests.

Tests should be deterministic and runnable without AWS credentials.

---

# Security Tests

For security-sensitive Lambda changes, test at least:

* missing authentication
* invalid JWT
* expired/invalid token where practical
* unauthorized user
* unauthorized group
* invalid input
* missing required fields
* malformed request body
* resource ownership violations
* secret access violations

For secret-related functionality, explicitly test that unauthorized users cannot retrieve or modify another user's secrets.

---

# API Changes

When adding or modifying an API endpoint, review all of:

```text
backend/
terraform/modules/api_gateway.tf
frontend/
backend/__tests__/
```

Do not update only the frontend or only the Lambda.

Maintain consistency between:

```text
Frontend request
        |
API Gateway route
        |
Lambda handler
        |
Authorization
        |
DynamoDB/Cognito
        |
Lambda response
        |
Frontend handling
```

---

# Sharing Model

RunaVault supports sharing secrets with:

* individual users
* Cognito groups

Supported roles include:

```text
Viewer
Editor
```

When modifying sharing functionality, explicitly verify:

1. Who owns the secret?
2. Who is requesting access?
3. Is the user an individual recipient?
4. Is the user a member of an allowed group?
5. What role does the user have?
6. Is the requested operation permitted for that role?

Never rely on the frontend to enforce sharing permissions.

Authorization must be enforced by the backend.

---

# Admin Functionality

Administrative functionality is restricted to users in the appropriate Cognito admin group.

Do not expose administrative operations merely because a user is authenticated.

When modifying the Admin Panel or administrative Lambda functions:

* verify Cognito group membership
* enforce authorization server-side
* avoid exposing user credentials or tokens
* avoid returning sensitive Cognito attributes unnecessarily

---

# Sensitive Information

Never commit:

```text
AWS access keys
AWS secret keys
Cognito client secrets
private keys
tokens
passwords
real credentials
production secrets
real customer data
```

Do not add real credentials to:

```text
README.md
tests
fixtures
Terraform variables
frontend source
GitHub Actions
documentation
```

Use placeholders.

---

# GitHub Actions

Before modifying CI/CD:

1. Inspect existing workflows.
2. Preserve existing deployment assumptions.
3. Avoid storing credentials directly in workflow files.
4. Prefer GitHub Secrets/OIDC and AWS IAM roles where applicable.
5. Do not weaken security checks merely to make CI pass.

---

# Dependencies

Before adding a dependency, consider:

1. Can the existing stack solve the problem?
2. Is the dependency actively maintained?
3. Does it increase frontend bundle size?
4. Does it increase Lambda deployment size?
5. Does it introduce security or supply-chain risk?
6. Is it compatible with the current Node.js version?

Do not add dependencies for trivial functionality that can be implemented with existing APIs.

---

# Refactoring Rules

Avoid large refactors while implementing unrelated features.

Do not combine:

```text
feature change
+
architecture rewrite
+
dependency migration
+
formatting changes
```

in one PR unless explicitly requested.

Keep diffs focused.

Preserve behavior unless the task explicitly requires behavior changes.

---

# Documentation

When changing externally visible behavior, update the relevant documentation.

Potential files include:

```text
README.md
CHANGELOG.md
CONTRIBUTION.md
```

Document:

* new environment variables
* new Terraform variables
* new API endpoints
* new deployment requirements
* breaking changes
* security-sensitive behavior

Do not document implementation details that are likely to become stale unless they are important for contributors.

---

# Git Workflow

Before a major change, check whether the project expects a GitHub issue.

Preferred branch naming:

```text
feature/<name>
fix/<name>
```

Commit messages should clearly describe the change.

Avoid commits such as:

```text
fix
changes
update
test
stuff
```

Prefer:

```text
fix: validate secret ownership before update
feat: add group-based secret sharing
fix: reject unauthenticated API requests
```

Do not commit generated or unrelated files unless they are intentionally tracked project artifacts.

Remember that:

```text
frontend/build/
```

is intentionally committed.

---

# Definition of Done

A change is generally complete when:

* the requested functionality works
* existing functionality is preserved
* authentication is enforced
* authorization is enforced
* user input is validated/sanitized
* secrets are not exposed
* relevant unit tests are added or updated
* backend tests pass
* frontend builds successfully when frontend code changes
* Terraform validates when infrastructure changes
* Terraform plan has been reviewed when applicable
* documentation is updated when behavior changes
* no secrets or credentials are committed
* the diff contains no unrelated changes

---

# Agent Behavior

When working on RunaVault, prioritize:

1. Security
2. Correct authorization
3. Data integrity
4. Backward compatibility
5. Test coverage
6. Minimal changes
7. Cost awareness
8. Simplicity

If an implementation choice has security implications, prefer the safer design even if it requires slightly more code.

If requirements are ambiguous and the ambiguity could affect security, data integrity, IAM permissions, encryption, or infrastructure destruction, inspect the existing implementation and configuration before making assumptions.

Do not silently weaken security controls to make a feature work.
