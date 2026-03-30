# Workflow Specification

## Document Shape

Every workflow document is YAML and must contain these top-level fields:

- `id`
- `name`
- `version`
- `description`
- `permissions`
- `inputs`
- `triggers`
- `steps`
- `outputs`
- `rollback`
- `safety`
- `audit`

## Permissions

Supported permissions in v1:

- `filesystem.read`
- `filesystem.write`
- `command.exec`
- `network.http`
- `secrets.read`
- `openclaw.context.read`

Each permission entry contains:

- `name`
- `reason`
- `required` optional, defaults to `true`

## Step Types

### `readFile`

Required fields:

- `id`
- `type`
- `path`

Optional fields:

- `encoding`
- `maxBytes`
- `timeoutMs`
- `onFailure`

### `writeFile`

Required fields:

- `id`
- `type`
- `path`
- `content`

Optional fields:

- `ifExists`
- `timeoutMs`
- `onFailure`

### `runCommand`

Required fields:

- `id`
- `type`
- `command`

Optional fields:

- `args`
- `cwd`
- `captureOutput`
- `timeoutMs`
- `onFailure`

## Safety Policy

`safety` contains:

- `dryRunByDefault`
- `requireExplicitConfirmation`
- `allowlists.commands`
- `allowlists.paths`
- `allowlists.hosts`
- `limits.stepTimeoutMs`
- `limits.maxOutputBytes`
- `guards.blockUnsafeShellInterpolation`
- `guards.redactSecrets`

## Audit Configuration

`audit` contains:

- `logFile`
- `includePlan`
- `includeEnvironment`

## Rollback

`rollback` is declarative in v1:

```yaml
rollback:
  steps:
    - id: cleanup-temp-file
      type: writeFile
      path: ./tmp/output.txt
      content: ""
      ifExists: overwrite
```

Rollback steps are validated but not automatically triggered yet. This keeps recovery explicit while the failure model remains small and reviewable.

## Signing Roadmap

- TODO(v2): add cryptographic signature metadata to manifests.
- TODO(v2): add trust policy for approved signers.
