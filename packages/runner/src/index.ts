import { access, appendFile, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import type { JsonLineAuditLogger } from '@secure-clawflows/audit';
import { createExecutionPlan, type PlanOptions } from '@secure-clawflows/core';
import {
  assertPolicyEvaluation,
  evaluateWorkflowPolicy,
  resolveAllowlistedPath,
  resolveCommand,
  type PolicyContext,
} from '@secure-clawflows/policy-engine';
import type {
  ReadFileStep,
  RunCommandStep,
  WorkflowManifest,
  WorkflowStep,
  WriteFileStep,
} from '@secure-clawflows/schema';

export interface RunnerOptions extends PlanOptions {
  workspaceRoot: string;
}

export interface StepExecutionResult {
  stepId: string;
  type: WorkflowStep['type'];
  status: 'completed' | 'skipped' | 'failed';
  output?: string;
  error?: string;
}

export interface WorkflowRunResult {
  success: boolean;
  dryRun: boolean;
  results: StepExecutionResult[];
}

function createSafeEnvironment(): NodeJS.ProcessEnv {
  const allowedKeys = [
    'COMSPEC',
    'HOME',
    'HOMEDRIVE',
    'HOMEPATH',
    'PATH',
    'PATHEXT',
    'SystemRoot',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'windir',
  ];

  return Object.fromEntries(
    allowedKeys
      .map((key) => [key, process.env[key]])
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

async function ensureParentDirectoryExists(filePath: string): Promise<void> {
  const parentDirectory = path.dirname(filePath);
  await access(parentDirectory);
}

async function executeReadFile(
  step: ReadFileStep,
  manifest: WorkflowManifest,
  context: PolicyContext,
): Promise<string> {
  const resolvedPath = resolveAllowlistedPath(step.path, manifest, context);
  const buffer = await readFile(resolvedPath);
  const limit = Math.min(step.maxBytes ?? manifest.safety.limits.maxOutputBytes, manifest.safety.limits.maxOutputBytes);

  if (buffer.byteLength > limit) {
    throw new Error(`Read exceeds max allowed bytes (${limit}).`);
  }

  return step.encoding === 'base64' ? buffer.toString('base64') : buffer.toString('utf8');
}

async function executeWriteFile(
  step: WriteFileStep,
  manifest: WorkflowManifest,
  context: PolicyContext,
): Promise<void> {
  const resolvedPath = resolveAllowlistedPath(step.path, manifest, context);
  await ensureParentDirectoryExists(resolvedPath);

  const fileExists = await stat(resolvedPath)
    .then(() => true)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return false;
      }

      throw error;
    });

  if (step.ifExists === 'error' && fileExists) {
    throw new Error(`Refusing to overwrite existing file "${step.path}".`);
  }

  if (step.ifExists === 'append') {
    await appendFile(resolvedPath, step.content, 'utf8');
    return;
  }

  await writeFile(resolvedPath, step.content, 'utf8');
}

async function executeRunCommand(
  step: RunCommandStep,
  manifest: WorkflowManifest,
  context: PolicyContext,
): Promise<string> {
  const command = resolveCommand(step.command, manifest);
  const cwd = step.cwd
    ? resolveAllowlistedPath(step.cwd, manifest, context)
    : context.workspaceRoot;
  const timeoutMs = Math.min(
    step.timeoutMs ?? manifest.safety.limits.stepTimeoutMs,
    manifest.safety.limits.stepTimeoutMs,
  );
  const outputLimit = manifest.safety.limits.maxOutputBytes;

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, step.args, {
      cwd,
      env: createSafeEnvironment(),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let totalBytes = 0;

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    const onChunk = (chunk: Buffer, target: Buffer[]): void => {
      totalBytes += chunk.byteLength;
      if (totalBytes > outputLimit) {
        clearTimeout(timer);
        child.kill();
        reject(new Error(`Command output exceeded ${outputLimit} bytes.`));
        return;
      }

      target.push(chunk);
    };

    child.stdout?.on('data', (chunk: Buffer) => onChunk(chunk, stdoutChunks));
    child.stderr?.on('data', (chunk: Buffer) => onChunk(chunk, stderrChunks));

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();

      if (code !== 0) {
        reject(new Error(stderr || `Command exited with code ${code}.`));
        return;
      }

      resolve(step.captureOutput === false ? '' : stdout);
    });
  });
}

export class WorkflowRunner {
  constructor(private readonly auditLogger: JsonLineAuditLogger) {}

  async run(manifest: WorkflowManifest, options: RunnerOptions): Promise<WorkflowRunResult> {
    const policyEvaluation = evaluateWorkflowPolicy(manifest, {
      workspaceRoot: options.workspaceRoot,
    });
    assertPolicyEvaluation(policyEvaluation);

    const plan = createExecutionPlan(manifest, policyEvaluation, options);
    const results: StepExecutionResult[] = [];

    if (manifest.audit.includePlan) {
      await this.auditLogger.log({
        event: 'workflow.plan',
        level: 'info',
        workflowId: manifest.id,
        dryRun: plan.effectiveDryRun,
        details: {
          plan,
        },
      });
    }

    await this.auditLogger.log({
      event: 'workflow.started',
      level: 'info',
      workflowId: manifest.id,
      dryRun: plan.effectiveDryRun,
      details: {
        requiresConfirmation: plan.requiresConfirmation,
        confirmationSatisfied: plan.confirmationSatisfied,
      },
    });

    for (const step of manifest.steps) {
      await this.auditLogger.log({
        event: 'step.started',
        level: 'info',
        workflowId: manifest.id,
        stepId: step.id,
        dryRun: plan.effectiveDryRun,
        details: {
          type: step.type,
        },
      });

      try {
        const output = await this.executeStep(step, manifest, options, plan.effectiveDryRun);
        const status = output === undefined ? 'completed' : output === '__skipped__' ? 'skipped' : 'completed';
        const normalizedOutput = output === '__skipped__' ? undefined : output;

        results.push({
          stepId: step.id,
          type: step.type,
          status,
          output: normalizedOutput,
        });

        await this.auditLogger.log({
          event: 'step.completed',
          level: 'info',
          workflowId: manifest.id,
          stepId: step.id,
          dryRun: plan.effectiveDryRun,
          details: {
            status,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Step failed.';

        results.push({
          stepId: step.id,
          type: step.type,
          status: 'failed',
          error: message,
        });

        await this.auditLogger.log({
          event: 'step.failed',
          level: 'error',
          workflowId: manifest.id,
          stepId: step.id,
          dryRun: plan.effectiveDryRun,
          details: {
            error: message,
          },
        });

        if (step.onFailure !== 'continue') {
          await this.auditLogger.log({
            event: 'workflow.failed',
            level: 'error',
            workflowId: manifest.id,
            dryRun: plan.effectiveDryRun,
            details: {
              failedStepId: step.id,
            },
          });

          return {
            success: false,
            dryRun: plan.effectiveDryRun,
            results,
          };
        }
      }
    }

    await this.auditLogger.log({
      event: 'workflow.completed',
      level: 'info',
      workflowId: manifest.id,
      dryRun: plan.effectiveDryRun,
      details: {
        success: true,
      },
    });

    return {
      success: results.every((result) => result.status !== 'failed'),
      dryRun: plan.effectiveDryRun,
      results,
    };
  }

  private async executeStep(
    step: WorkflowStep,
    manifest: WorkflowManifest,
    options: RunnerOptions,
    dryRun: boolean,
  ): Promise<string | undefined> {
    const context: PolicyContext = {
      workspaceRoot: options.workspaceRoot,
    };

    switch (step.type) {
      case 'readFile':
        return await executeReadFile(step, manifest, context);

      case 'writeFile':
        if (dryRun) {
          return '__skipped__';
        }

        await executeWriteFile(step, manifest, context);
        return undefined;

      case 'runCommand':
        if (dryRun) {
          return '__skipped__';
        }

        return await executeRunCommand(step, manifest, context);
    }
  }
}
