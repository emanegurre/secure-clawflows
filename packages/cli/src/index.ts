import path from 'node:path';

import { JsonLineAuditLogger } from '@secure-clawflows/audit';
import { createExecutionPlan, explainWorkflow } from '@secure-clawflows/core';
import { evaluateWorkflowPolicy } from '@secure-clawflows/policy-engine';
import { WorkflowRunner } from '@secure-clawflows/runner';
import {
  WorkflowManifestError,
  loadWorkflowManifest,
  type WorkflowManifest,
} from '@secure-clawflows/schema';

interface CliIO {
  info(message: string): void;
  error(message: string): void;
}

interface ParsedFlags {
  dryRun: boolean;
  confirm: boolean;
  logFile?: string;
  limit?: number;
}

function createDefaultIO(): CliIO {
  return {
    info: (message) => console.info(message),
    error: (message) => console.error(message),
  };
}

function printUsage(io: CliIO): void {
  io.info(`Usage:
  secure-clawflows validate <file>
  secure-clawflows plan <file>
  secure-clawflows run <file> [--dry-run] [--confirm]
  secure-clawflows dry-run <file>
  secure-clawflows explain <file>
  secure-clawflows permissions <file>
  secure-clawflows logs [--limit <n>] [--log-file <path>]
  secure-clawflows doctor`);
}

function parseFlags(argumentsList: string[]): ParsedFlags {
  const flags: ParsedFlags = {
    dryRun: false,
    confirm: false,
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const value = argumentsList[index];

    switch (value) {
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--confirm':
        flags.confirm = true;
        break;
      case '--log-file':
        flags.logFile = argumentsList[index + 1];
        index += 1;
        break;
      case '--limit':
        flags.limit = Number(argumentsList[index + 1]);
        index += 1;
        break;
      default:
        break;
    }
  }

  return flags;
}

function getDefaultAuditLog(cwd: string): string {
  return path.join(cwd, '.secure-clawflows', 'audit.log.jsonl');
}

async function loadManifest(filePath: string): Promise<WorkflowManifest> {
  return await loadWorkflowManifest(path.resolve(process.cwd(), filePath));
}

function formatFindings(findings: ReturnType<typeof evaluateWorkflowPolicy>['findings']): string[] {
  if (findings.length === 0) {
    return ['No policy findings.'];
  }

  return findings.map((finding) => {
    const stepPrefix = finding.stepId ? `[${finding.stepId}] ` : '';
    return `${finding.severity.toUpperCase()} ${stepPrefix}${finding.code}: ${finding.message}`;
  });
}

export async function runCli(argv: string[], io: CliIO = createDefaultIO()): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h') {
    printUsage(io);
    return 0;
  }

  const flags = parseFlags(rest);
  const positional = rest.filter((value, index) => {
    if (value.startsWith('--')) {
      return false;
    }

    const previous = rest[index - 1];
    return previous !== '--log-file' && previous !== '--limit';
  });

  try {
    switch (command) {
      case 'validate': {
        const file = positional[0];
        if (!file) {
          io.error('validate requires a workflow file path.');
          return 1;
        }

        const manifest = await loadManifest(file);
        const evaluation = evaluateWorkflowPolicy(manifest, { workspaceRoot: process.cwd() });

        io.info(`Manifest ${manifest.id} is structurally valid.`);
        for (const line of formatFindings(evaluation.findings)) {
          io.info(line);
        }

        return evaluation.allowed ? 0 : 1;
      }

      case 'plan': {
        const file = positional[0];
        if (!file) {
          io.error('plan requires a workflow file path.');
          return 1;
        }

        const manifest = await loadManifest(file);
        const evaluation = evaluateWorkflowPolicy(manifest, { workspaceRoot: process.cwd() });
        const plan = createExecutionPlan(manifest, evaluation, flags);

        io.info(`${plan.workflowName} (${plan.workflowId})`);
        io.info(`Version: ${plan.version}`);
        io.info(`Effective mode: ${plan.effectiveDryRun ? 'dry-run' : 'run'}`);
        io.info(`Confirmation required: ${plan.requiresConfirmation ? 'yes' : 'no'}`);
        io.info('Steps:');
        for (const step of plan.steps) {
          io.info(
            `- ${step.id}: ${step.summary} [permission=${step.permission}]${step.sensitive ? ' sensitive' : ''}`,
          );
        }
        for (const line of formatFindings(plan.policyFindings)) {
          io.info(line);
        }

        return evaluation.allowed ? 0 : 1;
      }

      case 'run':
      case 'dry-run': {
        const file = positional[0];
        if (!file) {
          io.error(`${command} requires a workflow file path.`);
          return 1;
        }

        const manifest = await loadManifest(file);
        const evaluation = evaluateWorkflowPolicy(manifest, { workspaceRoot: process.cwd() });
        const auditLogger = new JsonLineAuditLogger(
          path.resolve(process.cwd(), flags.logFile ?? manifest.audit.logFile ?? getDefaultAuditLog(process.cwd())),
        );
        const runner = new WorkflowRunner(auditLogger);
        const result = await runner.run(manifest, {
          workspaceRoot: process.cwd(),
          dryRun: command === 'dry-run' ? true : flags.dryRun,
          confirm: flags.confirm,
        });

        io.info(`Workflow ${manifest.id} finished with success=${result.success} dryRun=${result.dryRun}`);
        for (const stepResult of result.results) {
          io.info(
            `- ${stepResult.stepId}: ${stepResult.status}${
              stepResult.error ? ` (${stepResult.error})` : ''
            }`,
          );
        }
        for (const line of formatFindings(evaluation.findings)) {
          io.info(line);
        }

        return result.success ? 0 : 1;
      }

      case 'explain': {
        const file = positional[0];
        if (!file) {
          io.error('explain requires a workflow file path.');
          return 1;
        }

        const manifest = await loadManifest(file);
        const explanation = explainWorkflow(manifest);

        io.info(`${manifest.name}`);
        io.info(explanation.description);
        io.info('Permissions:');
        for (const permission of explanation.permissions) {
          io.info(
            `- ${permission.name}: ${permission.reason}${permission.sensitive ? ' [sensitive]' : ''}`,
          );
        }
        io.info(`Allowlisted commands: ${explanation.allowlists.commands.join(', ') || '(none)'}`);
        io.info(`Allowlisted paths: ${explanation.allowlists.paths.join(', ')}`);
        io.info(`Allowlisted hosts: ${explanation.allowlists.hosts.join(', ') || '(none)'}`);
        io.info(
          `Limits: timeout=${explanation.limits.stepTimeoutMs}ms maxOutputBytes=${explanation.limits.maxOutputBytes}`,
        );
        io.info(
          `Guards: blockUnsafeShellInterpolation=${String(
            explanation.guardrails.blockUnsafeShellInterpolation,
          )} redactSecrets=${String(explanation.guardrails.redactSecrets)}`,
        );

        return 0;
      }

      case 'permissions': {
        const file = positional[0];
        if (!file) {
          io.error('permissions requires a workflow file path.');
          return 1;
        }

        const manifest = await loadManifest(file);
        for (const permission of manifest.permissions) {
          io.info(
            `${permission.name} required=${String(permission.required)} reason="${permission.reason}"`,
          );
        }

        return 0;
      }

      case 'logs': {
        const auditLogger = new JsonLineAuditLogger(
          path.resolve(process.cwd(), flags.logFile ?? getDefaultAuditLog(process.cwd())),
        );
        const events = await auditLogger.read(flags.limit ?? 50);

        if (events.length === 0) {
          io.info('No audit events found.');
          return 0;
        }

        for (const event of events) {
          io.info(
            `${event.timestamp} ${event.level.toUpperCase()} ${event.event}${
              event.workflowId ? ` workflow=${event.workflowId}` : ''
            }${event.stepId ? ` step=${event.stepId}` : ''}`,
          );
        }

        return 0;
      }

      case 'doctor': {
        io.info(`Node.js: ${process.version}`);
        io.info(`Platform: ${process.platform}`);
        io.info(`Working directory: ${process.cwd()}`);
        io.info(`Default audit log: ${getDefaultAuditLog(process.cwd())}`);
        return 0;
      }

      default:
        io.error(`Unknown command "${command}".`);
        printUsage(io);
        return 1;
    }
  } catch (error) {
    if (error instanceof WorkflowManifestError) {
      io.error(error.message);
      for (const issue of error.issues) {
        io.error(`- ${issue}`);
      }
      return 1;
    }

    const message = error instanceof Error ? error.message : 'Unknown CLI failure.';
    io.error(message);
    return 1;
  }
}
