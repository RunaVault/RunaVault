# Machine authentication & the CLI

This document describes how [`runa`](https://github.com/RunaVault/RunaCli), the RunaVault CLI, and machine tokens fit into RunaVault's existing architecture: what changed, what didn't, and where plaintext secrets can and can't go.

## Human vs. machine identity

These are deliberately two separate authentication mechanisms, not two flavors of the same one:

```text
Human (browser or `runa login`):

  Browser / CLI
       |
       v
  Cognito Hosted UI (password + MFA, or Authorization Code + PKCE for the CLI)
       |
       v
  Short-lived Cognito ID token (~1 hour, silently refreshed)
       |
       v
  API Gateway --(dual-mode Lambda authorizer)--> Lambda --> DynamoDB / KMS


Machine (CI/CD, servers, scripts via RUNA_TOKEN):

  CI/CD job / server
       |
       v
  Opaque machine token (rv_live_..., created once via `runa auth token create`)
       |
       v
  API Gateway --(dual-mode Lambda authorizer)--> Lambda --> DynamoDB / KMS
                        |
                        v
        scope + secret-path + IP checks, immediate revocation
```

A machine token is never a JWT and is never long-lived by default. RunaVault stores only a SHA-256 hash of it (`backend/layers/nodejs/authz.js`); the plaintext is returned exactly once, at creation or rotation time.

## The dual-mode authorizer

Before this feature, API Gateway's native Cognito JWT authorizer both validated tokens *and* was the only way in - anything that wasn't a Cognito JWT was rejected before any Lambda ran. That authorizer has been replaced with a Lambda **REQUEST** authorizer (`backend/authorizer/index.js`) that:

1. Reads the `Authorization: Bearer ...` header.
2. If it looks like a JWT, verifies it against Cognito's JWKS (signature, audience, issuer) exactly as before, and attaches `{ authType: "cognito", userId, groups }` to the request context.
3. If it starts with `rv_live_`, hashes it and looks it up in the `RunaVault_machine_tokens` table. It checks, in order: the token exists, its status is `active`, it hasn't expired (checked directly, independent of the table's DynamoDB TTL, which is cleanup only), and - if the token has an IP allow-list - that the request's **API-Gateway-reported source IP** (`event.requestContext.http.sourceIp`, never a client-supplied header like `X-Forwarded-For`) is in it. On success it attaches `{ authType: "machine", userId: ownerId, tokenId, scopes, allowedSecretPaths }`.
4. Any failure returns a bare `{ isAuthorized: false }` - API Gateway turns this into an undecorated 403, so a failed machine-token lookup can't be used to probe whether a given token ID exists.

The authorizer's result is **never cached** (`authorizerResultTtlInSeconds = 0`), so revoking a token takes effect on the very next request.

Existing Cognito-authenticated routes and the web frontend are unaffected by this change - the same ID token is verified the same way, just by this Lambda instead of API Gateway's built-in authorizer.

## Where secrets get decrypted

This is the one place the security boundary genuinely moved, and it's additive rather than a replacement:

- **Browser reads** (unchanged): the frontend federates the user's Cognito ID token into temporary AWS credentials via a Cognito Identity Pool and calls **KMS `Decrypt` directly from the browser** (`frontend/src/CryptoUtils.js`). RunaVault's Lambdas never see this plaintext.
- **CLI / machine-token reads** (new): a CLI has no browser and a machine token has no path to Identity Pool federation, so `backend/get_secret/index.js` accepts an additive `plaintext: true` request field (the frontend never sends it - the ciphertext-blob response for browser callers is byte-for-byte unchanged). When set, the Lambda itself resolves the correct ciphertext variant for the caller (owner / matching group share / matching user share - the same selection algorithm as the frontend) and calls KMS `Decrypt` using its own narrowly-scoped IAM grant (`kms:Decrypt` only, never `kms:Encrypt` - this Lambda can read secrets, never create new ciphertext).

Concretely: plaintext secrets can now be observed in two places instead of one - the browser (as always) and this one Lambda's execution environment for the duration of a request. Nothing is logged; the audit trail records the resource *path* accessed (`<subdirectory>/<site>`), never the value.

## Scopes, secret paths, and IP restrictions

RunaVault didn't previously have a path/ACL concept for secrets - access is row-level (owner plus per-user/per-group shares). Machine-token restrictions are layered on top as a convention, not a rewrite of that model:

- **Path** = `<subdirectory>/<site>`, or bare `<site>` when there's no subdirectory. `--secret-path "production/*"` is a glob matched against this string.
- **Scope**: currently only `secrets:read` exists; the model (a string set on the token, checked via `requireScope()`) supports adding `secrets:write`/`secrets:delete` later without any format change. Machine tokens cannot create, edit, or delete secrets today regardless of scope.
- **IP allow-list**: stored as CIDRs (a bare IP is normalized to `/32` or `/128` at creation time), matched with correct IPv4 *and* IPv6 containment logic, always against the trusted API Gateway source IP.

All three are enforced in `backend/get_secret/index.js` and `backend/list_secrets/index.js` via the shared `backend/layers/nodejs/authz.js` layer - not duplicated per-handler, and not something the CLI can override locally, since the CLI never sees or applies these checks itself.

## Data model

Two new DynamoDB tables (`terraform/modules/dynamodb_machine_tokens.tf`, `terraform/modules/dynamodb_audit_log.tf`), kept separate from the existing `RunaVault_passwords` table:

- `RunaVault_machine_tokens` - `owner_id` (PK) / `token_id` (SK), with a `token-hash-index` GSI the authorizer queries on every machine-token request. Never stores plaintext.
- `RunaVault_audit_log` - `subject_id` (PK, token or owner ID) / `event_id` (SK), TTL'd after 180 days. Records who accessed what, when, from where, and whether it succeeded - never token or secret plaintext.

## Encryption format notes

The KMS ciphertext blob itself is opaque and versioned by KMS's own key rotation - it needs no additional version marker. The JSON envelope that wraps it (`{ encryptedPassword, sharedWith: { users, groups } }`) is unchanged by this work; a future format change should add an explicit `envelopeVersion` field (defaulting to `1` when absent) so old stored items keep decrypting correctly, per the project's backward-compatibility rule for anything touching the ciphertext envelope.
