import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { JsonLineAuditLogger } from '@secure-clawflows/audit';
import { parseWorkflowManifest } from '@secure-clawflows/schema';

import { WorkflowRunner } from './index.js';

describe('WorkflowRunner', () => {
  let tempDirectory: string;

  beforeEach(async () => {
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'secure-clawflows-'));
  });

  it('skips write steps during dry-run', async () => {
    const outputFile = path.join(tempDirectory, 'output.txt');
    const manifest = parseWorkflowManifest(`
id: dry-run-write
name: Dry Run Write
version: 1.0.0
description: Attempt to write a file, but keep it in dry-run mode unless explicitly confirmed.
permissions:
  - name: filesystem.write
    reason: Write a controlled file inside the temporary workspace.
inputs: []
triggers:
  - type: manual
steps:
  - id: write-output
    type: writeFile
    path: ./output.txt
    content: generated
    ifExists: overwrite
outputs:
  - name: targetFile
    description: The file that would be written.
    fromStep: write-output
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
`);

    const runner = new WorkflowRunner(
      new JsonLineAuditLogger(path.join(tempDirectory, '.secure-clawflows', 'audit.log.jsonl')),
    );

    const result = await runner.run(manifest, {
      workspaceRoot: tempDirectory,
    });

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    await expect(readFile(outputFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('executes a safe read step', async () => {
    const targetFile = path.join(tempDirectory, 'README.txt');
    await writeFile(targetFile, 'hello from secure-clawflows', 'utf8');

    const manifest = parseWorkflowManifest(`
id: safe-read
name: Safe Read
version: 1.0.0
description: Read a file from the temporary workspace without performing any mutation.
permissions:
  - name: filesystem.read
    reason: Read a known temporary file from an allowlisted path.
inputs: []
triggers:
  - type: manual
steps:
  - id: read-target
    type: readFile
    path: ./README.txt
    encoding: utf8
outputs:
  - name: fileContent
    description: Captured content from the target file.
    fromStep: read-target
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
  includePlan: false
  includeEnvironment: false
`);

    const runner = new WorkflowRunner(
      new JsonLineAuditLogger(path.join(tempDirectory, '.secure-clawflows', 'audit.log.jsonl')),
    );
    const result = await runner.run(manifest, {
      workspaceRoot: tempDirectory,
    });

    expect(result.success).toBe(true);
    expect(result.results[0]?.output).toContain('secure-clawflows');
  });
});
