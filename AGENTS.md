# AGENTS.md — AI Coding Agent Instructions for RunaVault

RunaVault is a **serverless, self-hosted password manager** built on AWS free-tier services (Lambda, DynamoDB, Cognito, KMS, API Gateway, CloudFront) with a React/Vite frontend. Infrastructure is managed with Terraform.

---

## Repository Layout

```
backend/               # AWS Lambda functions (one directory per Lambda)
  __tests__/           # Jest unit tests for all Lambda functions
  layers/nodejs/       # Shared Lambda layer — utils.js (verifyToken, formatResponse, parseBody, getAuthToken, sanitizeString, sanitizeObject)
  <function_name>/     # Each Lambda: index.js + package.json
  jest.config.cjs      # Jest config with 80% coverage thresholds
  package.json         # Root devDependencies (Jest, Babel, AWS SDK mocks)

frontend/              # React 19 + Vite SPA
  src/                 # Application source (.js files treated as JSX)
  build/               # Production build output (committed; used by Terraform)
  vite.config.js

terraform/
  application/         # Root module — edit main.tf for deployment values
  modules/             # All AWS resource definitions (one .tf file per service/lambda)
```

---

## Development Commands

### Backend (Lambda + Tests)
```bash
cd backend
npm install
npm test                  # Run Jest with coverage (enforces 80% thresholds)
npm run test:watch        # Watch mode
```

### Frontend
```bash
cd frontend
npm install
npm start                 # Vite dev server
npm run build             # Produces frontend/build/ (required before Terraform deploy)
npm run preview           # Preview production build locally
```

### Infrastructure
```bash
cd terraform/application
terraform init
terraform plan
terraform apply
```

---

## Architecture Patterns

### Lambda Functions
- Each Lambda lives in `backend/<function_name>/index.js` and exports a single `handler`.
- All handlers follow this structure:
  1. Extract and verify the Cognito JWT via `getAuthToken(event)` + `verifyToken(token)`.
  2. Parse and sanitize the request body with `parseBody(event.body)`.
  3. Interact with DynamoDB or Cognito.
  4. Return via `formatResponse(statusCode, body)`.
- Shared utilities are imported from `/opt/utils.js` (the Lambda layer — `backend/layers/nodejs/utils.js`).
- The DynamoDB table prefix is controlled by `process.env.TABLE_PREFIX` (default: `"RunaVault_"`).

### Frontend
- React 19 with hooks; `.js` files contain JSX (Vite is configured to handle this).
- AWS credentials for KMS are obtained at runtime via Cognito Identity Pool (`CryptoUtils.js`).
- All environment variables are injected via Vite (`VITE_` prefix); see `CryptoUtils.js` for required vars:
  - `VITE_AWS_REGION`, `VITE_KMS_KEY_ID`, `VITE_IDENTITY_POOL_ID`, `VITE_COGNITO_ID`

### Security
- Passwords are encrypted **client-side** using AWS KMS before being sent to the backend.
- Every Lambda validates the Cognito JWT on every request — never skip `verifyToken`.
- User input is sanitized via `sanitizeString` / `sanitizeObject` in the shared layer. Always sanitize before storing.
- The `formatResponse` helper always sets `Access-Control-Allow-Origin: *` — do not widen this further.

---

## Testing Guidelines

- All Lambda tests live in `backend/__tests__/<function_name>.test.js`.
- Mock `/opt/utils.js` as a virtual module in every test file (see existing tests for the pattern).
- Mock AWS SDK clients (`@aws-sdk/client-dynamodb`, `@aws-sdk/client-cognito-identity-provider`) using `aws-sdk-client-mock`.
- The global coverage threshold is **80%** for branches, functions, lines, and statements. Some Lambda functions have lower per-file thresholds (60/40/70/70) — check `jest.config.cjs` before adding new functions.
- `maxWorkers: 1` is set intentionally — keep tests serial to avoid mock state leakage.
- Do **not** re-enable `forceExit` or `bail` without discussion; they are intentionally disabled.

---

## Adding a New Lambda Function

1. Create `backend/<function_name>/index.js` and `backend/<function_name>/package.json`.
2. Add a corresponding `backend/__tests__/<function_name>.test.js`.
3. Add a Terraform resource file at `terraform/modules/lambda_<function_name>.tf` following the existing Lambda `.tf` files as a template.
4. Register the new API route in `terraform/modules/api_gateway.tf`.

---

## Code Style

- Backend: ES Modules (`"type": "module"` in `package.json`). Use `import`/`export`, not `require`.
- Frontend: Standard React hooks patterns; no TypeScript (plain JS with JSX).
- No external linter config is present — follow the style of the surrounding file.
- Commit messages should be descriptive (see CONTRIBUTION.md).

---

## Contribution Workflow

- Open a GitHub issue before starting any major change.
- Branch naming: `feature/<name>`, `fix/<name>`.
- All tests must pass and coverage thresholds must be met before opening a PR.
- Do not commit secrets, credentials, or real AWS account IDs.
- The `frontend/build/` directory is committed — run `npm run build` and include the updated build in PRs that change frontend code.
