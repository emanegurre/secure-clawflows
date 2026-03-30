# Security Policy

## Scope

`secure-clawflows` is designed to execute local workflows under explicit policy control. Security takes priority over convenience, implicit behavior, or aggressive automation.

## Security Guarantees in v1

- Workflow manifests are validated with Zod before planning or execution.
- Command execution uses `spawn` with `shell: false`.
- Commands must be present in an explicit allowlist.
- File reads and writes must resolve inside an explicit allowlist.
- Sensitive permissions default to dry-run unless explicit confirmation is provided.
- Audit events are written as JSON Lines for machine parsing and incident review.
- Secrets are not stored in workflow definitions.

## Out of Scope in v1

- Cryptographic signing and verification of workflow manifests.
- Remote secret retrieval backends.
- Sandboxed container isolation.
- Network step execution.

## Reporting

Treat the repository as private until a coordinated disclosure process exists. Security issues should be handled through a private channel and fixed before public release.

## Hard Requirements for Contributors

- Do not add shell-based command execution helpers.
- Do not relax allowlist checks to infer trust from user input.
- Do not serialize secret values into audit logs.
- Do not add networked integrations without host allowlist enforcement.
- Do not merge workflows or examples that require `--confirm` without documenting the reason.

## Roadmap

- v2: manifest signature verification and trust roots.
- v2: secrets provider abstraction with explicit redaction contracts.
- v2: stronger provenance for audit envelopes and tamper detection.
