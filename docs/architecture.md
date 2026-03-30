# Architecture

## Overview

`secure-clawflows` is organized as a `pnpm` monorepo with small packages and explicit package boundaries.

## Package Responsibilities

- `@secure-clawflows/schema`
  Parses YAML manifests and validates them with Zod.
- `@secure-clawflows/policy-engine`
  Evaluates requested permissions, allowlists, path scope, and execution limits.
- `@secure-clawflows/core`
  Builds execution plans and human-readable explanations from validated manifests.
- `@secure-clawflows/audit`
  Persists structured audit events as JSON Lines.
- `@secure-clawflows/runner`
  Executes approved plans with dry-run semantics and step-level enforcement.
- `@secure-clawflows/integrations`
  Holds adapter contracts for OpenClaw and future external systems.
- `@secure-clawflows/cli`
  Exposes user-facing commands and process exit behavior.

## Runtime Flow

1. CLI loads a YAML manifest.
2. Schema package parses and validates the document.
3. Policy engine evaluates allowlists, permissions, and step safety.
4. Core package builds an execution plan and sensitivity summary.
5. Runner executes or simulates the plan.
6. Audit package records every material decision and step event.

## Security Boundaries

- Manifest validation happens before planning.
- Policy checks happen before execution.
- Step execution repeats step-local checks before side effects.
- CLI confirmation gates sensitive writes and command execution.
- Audit logging is append-only within the configured log target.

## Why No Shell

Command steps take an executable plus argument array. This avoids shell interpolation, platform-specific quoting bugs, and accidental command chaining.

## Future Hooks

- TODO(v2): verify manifest signatures before plan construction.
- TODO(v2): attach immutable provenance metadata to audit records.
- TODO(v2): provide a network executor package with host-level policy enforcement.
