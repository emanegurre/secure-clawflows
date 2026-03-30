# Threat Model

## Assets

- Local filesystem contents.
- OpenClaw context data.
- Secrets managed outside workflow manifests.
- Audit history.
- Trusted command execution surface.

## Threat Actors

- A workflow author attempting privilege escalation.
- A user executing an unreviewed workflow.
- Malware attempting to piggyback on command execution.
- An operator misunderstanding workflow side effects.

## Primary Threats

### Arbitrary Command Execution

Mitigation:

- `runCommand` uses `spawn` with `shell: false`.
- Commands must match an allowlist.
- Unsafe interpolation patterns are rejected.
- Sensitive execution defaults to dry-run.

### Filesystem Exfiltration or Corruption

Mitigation:

- Read and write operations are scoped to an allowlisted path set.
- Writes require explicit confirmation for non-dry-run execution.
- Output size is bounded.

### Secret Leakage

Mitigation:

- Secrets are not embedded in manifests.
- Audit logs redact sensitive fields.
- `secrets.read` exists as a declarative permission only in v1.

### Network Abuse

Mitigation:

- Network permissions are declared but no network step exists in v1.
- Host allowlists are part of the policy model for forward compatibility.

### Tampering and Repudiation

Mitigation:

- Audit events are structured and time-stamped.
- TODO(v2): manifest signatures and stronger audit provenance.

## Assumptions

- The local machine is not fully sandboxed.
- Users can inspect manifests before execution.
- Workflow files are treated as code and must be reviewed.

## Residual Risk

If an allowlist is overly broad, a workflow can still do harmful but policy-compliant work. The project treats narrow policy authoring as mandatory operational discipline.
