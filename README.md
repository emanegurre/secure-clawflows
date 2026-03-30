# secure-clawflows

`secure-clawflows` is a security-first workflow runtime for OpenClaw. It trades convenience for explicit validation, deterministic policy checks, structured auditability, and conservative defaults.

## Design Goals

- Manifest-first execution with strict schema validation.
- Explicit permission requests per workflow.
- Policy enforcement before runtime, not after failure.
- Dry-run by default for sensitive operations.
- Structured audit logs for every decision and step.
- No secret values embedded in workflow manifests.
- Cross-platform execution on Windows, Linux, and macOS.

## Repository Layout

```text
packages/
  audit/          Structured JSONL audit logging
  cli/            Secure CLI entrypoint
  core/           Domain models and planning services
  integrations/   External adapter contracts
  policy-engine/  Permission and allowlist enforcement
  runner/         Workflow execution engine
  schema/         YAML parsing and Zod validation
docs/
  architecture.md
  openclaw-integration.md
  threat-model.md
  workflow-spec.md
examples/workflows/
  read-repository-metadata.yaml
  write-sandbox-report.yaml
  verify-node-runtime.yaml
scripts/
  install-openclaw.mjs
```

## Requirements

- Node.js 22
- `corepack`
- `pnpm` via `corepack`

## Local Installation

```bash
corepack enable
corepack pnpm install
corepack pnpm build
```

## OpenClaw Installation

To expose the runtime to OpenClaw and sync instructions into the workspace `AGENTS.md`:

```bash
node scripts/install-openclaw.mjs
```

This installer:

- builds the monorepo
- creates a `secure-clawflows` CLI shim under `~/.local/bin`
- detects the OpenClaw workspace from `~/.openclaw/openclaw.json` when present
- updates the workspace `AGENTS.md`

See [docs/openclaw-integration.md](./docs/openclaw-integration.md) for the exact integration model.

## CLI Usage

You can invoke the CLI in either of these ways:

```bash
corepack pnpm cli -- validate examples/workflows/read-repository-metadata.yaml
corepack pnpm cli -- plan examples/workflows/write-sandbox-report.yaml
corepack pnpm cli -- run examples/workflows/write-sandbox-report.yaml --dry-run
corepack pnpm cli -- explain examples/workflows/verify-node-runtime.yaml
corepack pnpm cli -- logs
```

After `node scripts/install-openclaw.mjs`, you can use the installed shim directly:

```bash
secure-clawflows validate examples/workflows/read-repository-metadata.yaml
secure-clawflows plan examples/workflows/write-sandbox-report.yaml
secure-clawflows run examples/workflows/write-sandbox-report.yaml --dry-run
secure-clawflows explain examples/workflows/verify-node-runtime.yaml
secure-clawflows permissions examples/workflows/verify-node-runtime.yaml
secure-clawflows logs
secure-clawflows doctor
```

## Security Posture

- `runCommand` uses `spawn` with `shell: false`.
- Path access is constrained to workflow allowlists.
- Command execution is constrained to workflow allowlists.
- Sensitive permissions require explicit confirmation.
- Audit logging defaults to JSON Lines under `.secure-clawflows/`.
- Secrets are referenced by policy intent only; they are not embedded in manifests.

See [SECURITY.md](./SECURITY.md), [docs/architecture.md](./docs/architecture.md), and [docs/threat-model.md](./docs/threat-model.md) for the rationale.

## Example Workflow

```yaml
id: verify-node-runtime
name: Verify Node Runtime
version: 1.0.0
description: Confirm that the local Node.js runtime is available.
permissions:
  - name: command.exec
    reason: Run node --version without a shell.
inputs: []
triggers:
  - type: manual
steps:
  - id: node-version
    type: runCommand
    command: node
    args:
      - --version
outputs:
  - name: runtimeVersion
    description: Captured stdout from node --version.
    fromStep: node-version
rollback:
  steps: []
safety:
  dryRunByDefault: true
  requireExplicitConfirmation: true
  allowlists:
    commands:
      - node
    paths:
      - .
    hosts: []
  limits:
    stepTimeoutMs: 5000
    maxOutputBytes: 16384
  guards:
    blockUnsafeShellInterpolation: true
    redactSecrets: true
audit:
  logFile: .secure-clawflows/audit.log.jsonl
  includePlan: true
  includeEnvironment: false
```

## Development

```bash
corepack pnpm lint
corepack pnpm test
corepack pnpm typecheck
```

The first iteration intentionally leaves manifest signature verification for v2. TODO markers are kept in the codebase where cryptographic signing hooks must be introduced.
