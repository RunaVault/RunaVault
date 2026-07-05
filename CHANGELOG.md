# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-07-05
### Added
- **Password strength indicator** in the Create Secret form — color-coded bar and label (Weak / Fair / Good / Strong) that updates as you type
- **Existing tags dropdown** in the Create Secret form — tags already used across your secrets appear as suggestions in the tag selector
- **Lambda layer auto-build** — `npm ci --omit=dev` now runs automatically before packaging the shared Node.js layer, triggered by changes to `package-lock.json`
- **Lambda npm install support** — lambda module gained an optional `npm_install` flag; enabled for `create_secret` which bundles `uuid` as a local dependency

### Changed
- **API Gateway HTTP methods** updated to proper REST semantics:
  - `delete_secret` → `DELETE`
  - `edit_secret` → `PUT`
  - `edit_users` → `PUT`
  - `delete_group` → `DELETE`
  - `remove_user_from_groups` → `DELETE`
  - `list_user_groups` → `GET` (parameters moved to query string)
  - `get_secret` remains `POST` (complex body required)
- **CloudFront + S3 integration migrated from OAI to OAC** (Origin Access Control) — more secure SigV4-signed requests; removed CORS-S3Origin request policy which broke OAC signing
- **S3 frontend bucket** now uses the RunaVault CMK explicitly (instead of the default `aws/s3` key) so CloudFront OAC can be granted `kms:Decrypt` access
- **CloudFront logging** migrated from legacy ACL-based delivery to bucket policy with `delivery.logs.amazonaws.com` service principal — compatible with modern S3 bucket ownership defaults
- **CloudWatch log group name** for API Gateway sanitised to strip `$` from stage name (`$default` → `default`) which was invalid in log group names

### Fixed
- **Password reset for unconfirmed users** — `AdminResetUserPasswordCommand` fails for users in `FORCE_CHANGE_PASSWORD` state; now uses `AdminCreateUser` with `MessageAction: RESEND` which re-sends the invite email with a fresh temporary password. Email is extracted from user attributes so UUID subs don't cause "Username should be an email" errors
- **`create_secret` Lambda serialization error** — `password` field arriving as a parsed JS object was passed directly into DynamoDB's `S` (string) type, causing `SerializationException`. Now always serialised to a JSON string before storage
- **`list_user_groups` Lambda** updated to read `username` and `listAllUsers` from query string parameters after the endpoint was changed to `GET`
- **Terraform dependency cycle** between S3 bucket policy and CloudFront distribution resolved by constructing the distribution ARN from its `id` attribute rather than referencing `.arn` directly

### Security
- **KMS key policy** — added `kms:Decrypt` grant for `cloudfront.amazonaws.com` scoped to the specific distribution ARN, required for CloudFront OAC to serve KMS-encrypted S3 objects
- **`edit_users` Lambda IAM policy** — added `cognito-idp:AdminGetUser` and `cognito-idp:AdminCreateUser` permissions required for the improved password reset flow
- **`Access-Control-Allow-Origin`** in API responses remains `*` — tracked for future tightening to the frontend domain

## [1.0.2] - 2025-09-30
### Changed
- Fixed sonar findings
- Updated vulnerable packages in package-lock.json
- Added terraform CI tests

## [1.0.1] - 2025-06-01
### Changed
- Fixed lambda logging to remove unnessesary console.log
- Added CONTRIBUTION.md file

### Fixed
- Fixed an error when you create and share a secret

## [1.0.0] - 2025-05-11
### Added
- First release 

---

### Changelog Guidelines:
1. Group changes by type (Added, Changed, Deprecated, Removed, Fixed, Security)
2. List versions in reverse chronological order (newest first)
3. Include dates for each version in [YYYY-MM-DD] format
4. Use semantic versioning (MAJOR.MINOR.PATCH)
5. Keep an Unreleased section for upcoming changes
6. Mention breaking changes clearly
7. Link to relevant issues/PRs when possible

