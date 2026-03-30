import { describe, expect, it } from 'vitest';

import { parseWorkflowManifest, safeParseWorkflowManifest } from './index.js';

const validManifest = `
id: verify-node-runtime
name: Verify Node Runtime
version: 1.0.0
description: Confirm that the local Node.js runtime is available without invoking a shell.
permissions:
  - name: command.exec
    reason: Run node --version without shell interpretation.
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
`;

describe('workflowManifestSchema', () => {
  it('parses a valid manifest', () => {
    const manifest = parseWorkflowManifest(validManifest);

    expect(manifest.id).toBe('verify-node-runtime');
    expect(manifest.steps).toHaveLength(1);
    expect(manifest.steps[0]?.type).toBe('runCommand');
  });

  it('rejects step permissions that are missing', () => {
    const invalid = validManifest.replace('command.exec', 'filesystem.read');
    const result = safeParseWorkflowManifest(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.join('\n')).toContain('missing permission "command.exec"');
    }
  });

  it('rejects unknown output references', () => {
    const invalid = validManifest.replace('fromStep: node-version', 'fromStep: unknown-step');
    const result = safeParseWorkflowManifest(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.join('\n')).toContain('output references unknown step "unknown-step"');
    }
  });
});
