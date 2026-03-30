# OpenClaw Integration

`secure-clawflows` is a standalone runtime, not an OpenClaw plugin. The intended integration model is:

1. build the runtime locally
2. expose the CLI as `secure-clawflows`
3. sync a managed reference block into the OpenClaw workspace `AGENTS.md`

## Install Into OpenClaw

From the repository root:

```bash
node scripts/install-openclaw.mjs
```

The installer:

- runs `corepack pnpm install`
- runs `corepack pnpm build`
- creates a CLI shim in `~/.local/bin`
- detects the OpenClaw workspace from `~/.openclaw/openclaw.json` when present
- updates the workspace `AGENTS.md` with `secure-clawflows` usage

## What This Enables

Once installed, OpenClaw can call:

- `secure-clawflows validate <file>`
- `secure-clawflows plan <file>`
- `secure-clawflows run <file> --dry-run`
- `secure-clawflows explain <file>`
- `secure-clawflows permissions <file>`
- `secure-clawflows logs`
- `secure-clawflows doctor`

## Current Scope

This integration gives OpenClaw access to the runtime and its documentation. It does not yet add:

- automatic workflow discovery from OpenClaw memory
- automatic cron scheduling through OpenClaw
- automatic workflow registration in a remote catalog

Those would be future integration layers on top of the current runtime.
