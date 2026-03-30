import { describe, expect, it } from 'vitest';

import { parseWorkflowManifest } from '@secure-clawflows/schema';

import { evaluateWorkflowPolicy } from './index.js';

const baseManifest = `
id: secure-read
name: Secure Read
version: 1.0.0
description: Read a file from an allowlisted directory for inspection during a manual workflow.
permissions:
  - name: filesystem.read
    reason: Read a file that is already inside the trusted workspace.
inputs: []
triggers:
  - type: manual
steps:
  - id: readme
    type: readFile
    path: ./README.md
outputs:
  - name: content
    description: Captured content from the file.
    fromStep: readme
rollback:
  steps: []
safety:
  dryRunByDefault: true
  requireExplicitConfirmation: true
  allowlists:
    commands: []
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
`;

describe('evaluateWorkflowPolicy', () => {
  it('accepts allowlisted reads', () => {
    const manifest = parseWorkflowManifest(baseManifest);
    const evaluation = evaluateWorkflowPolicy(manifest, {
      workspaceRoot: process.cwd(),
    });

    expect(evaluation.allowed).toBe(true);
  });

  it('blocks commands outside the allowlist', () => {
    const manifest = parseWorkflowManifest(`
id: deny-command
name: Deny Command
version: 1.0.0
description: Attempt to run a command that has not been allowlisted and must be rejected by policy.
permissions:
  - name: command.exec
    reason: Try a non-allowlisted executable to exercise the policy engine.
inputs: []
triggers:
  - type: manual
steps:
  - id: run
    type: runCommand
    command: bash
    args:
      - -lc
      - echo blocked
outputs:
  - name: stdout
    description: Output from the rejected command.
    fromStep: run
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
`);

    const evaluation = evaluateWorkflowPolicy(manifest, {
      workspaceRoot: process.cwd(),
    });

    expect(evaluation.allowed).toBe(false);
    expect(evaluation.findings.map((finding) => finding.code)).toContain('command.not_allowlisted');
  });
});
