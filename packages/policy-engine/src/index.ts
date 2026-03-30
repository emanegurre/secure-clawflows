import path from 'node:path';

import {
  getRequiredPermissionForStep,
  isSensitivePermission,
  type PermissionName,
  type WorkflowManifest,
  type WorkflowStep,
} from '@secure-clawflows/schema';

export type PolicySeverity = 'error' | 'warning';

export interface PolicyFinding {
  code: string;
  message: string;
  severity: PolicySeverity;
  stepId?: string;
}

export interface PolicyEvaluation {
  allowed: boolean;
  findings: PolicyFinding[];
}

export interface PolicyContext {
  workspaceRoot: string;
}

export class PolicyError extends Error {
  readonly findings: PolicyFinding[];

  constructor(message: string, findings: PolicyFinding[]) {
    super(message);
    this.name = 'PolicyError';
    this.findings = findings;
  }
}

const unsafeInterpolationPattern = /[`|&;<>]|\$\(|\$\{|\r|\n|%[^%\s]+%/;

function normalizeValue(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function matchesCommandAllowlist(command: string, allowlist: string[]): boolean {
  const normalizedCommand = normalizeValue(command);
  const normalizedBase = normalizeValue(path.basename(command));

  return allowlist.some((allowed) => {
    const normalizedAllowed = normalizeValue(allowed);
    return normalizedAllowed === normalizedCommand || normalizedAllowed === normalizedBase;
  });
}

function isPathInside(basePath: string, targetPath: string): boolean {
  const relative = path.relative(basePath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function matchesPathAllowlist(candidate: string, manifest: WorkflowManifest, context: PolicyContext): boolean {
  const targetPath = path.resolve(context.workspaceRoot, candidate);

  return manifest.safety.allowlists.paths.some((allowedPath) =>
    isPathInside(path.resolve(context.workspaceRoot, allowedPath), targetPath),
  );
}

function hasPermission(manifest: WorkflowManifest, permissionName: PermissionName): boolean {
  return manifest.permissions.some((permission) => permission.name === permissionName);
}

function addFinding(
  findings: PolicyFinding[],
  finding: PolicyFinding,
): void {
  findings.push(finding);
}

function validateTimeout(
  findings: PolicyFinding[],
  step: WorkflowStep,
  manifest: WorkflowManifest,
): void {
  if (step.timeoutMs && step.timeoutMs > manifest.safety.limits.stepTimeoutMs) {
    addFinding(findings, {
      code: 'timeout.exceeds_limit',
      message: `step "${step.id}" requests timeout ${step.timeoutMs}ms above policy limit ${manifest.safety.limits.stepTimeoutMs}ms`,
      severity: 'error',
      stepId: step.id,
    });
  }
}

function validateInterpolation(
  findings: PolicyFinding[],
  values: string[],
  step: WorkflowStep,
  manifest: WorkflowManifest,
): void {
  if (!manifest.safety.guards.blockUnsafeShellInterpolation) {
    return;
  }

  for (const value of values) {
    if (unsafeInterpolationPattern.test(value)) {
      addFinding(findings, {
        code: 'command.unsafe_interpolation',
        message: `step "${step.id}" contains a value that looks like shell interpolation or command chaining`,
        severity: 'error',
        stepId: step.id,
      });
      return;
    }
  }
}

function validateStepPolicy(
  findings: PolicyFinding[],
  step: WorkflowStep,
  manifest: WorkflowManifest,
  context: PolicyContext,
): void {
  const requiredPermission = getRequiredPermissionForStep(step);

  if (!hasPermission(manifest, requiredPermission)) {
    addFinding(findings, {
      code: 'permission.missing',
      message: `step "${step.id}" requires permission "${requiredPermission}"`,
      severity: 'error',
      stepId: step.id,
    });
  }

  validateTimeout(findings, step, manifest);

  switch (step.type) {
    case 'readFile': {
      if (!matchesPathAllowlist(step.path, manifest, context)) {
        addFinding(findings, {
          code: 'filesystem.path_not_allowlisted',
          message: `step "${step.id}" reads a path outside the configured allowlist`,
          severity: 'error',
          stepId: step.id,
        });
      }

      if (step.maxBytes && step.maxBytes > manifest.safety.limits.maxOutputBytes) {
        addFinding(findings, {
          code: 'filesystem.max_bytes_exceeds_limit',
          message: `step "${step.id}" requests ${step.maxBytes} bytes above maxOutputBytes ${manifest.safety.limits.maxOutputBytes}`,
          severity: 'error',
          stepId: step.id,
        });
      }
      break;
    }

    case 'writeFile': {
      if (!matchesPathAllowlist(step.path, manifest, context)) {
        addFinding(findings, {
          code: 'filesystem.path_not_allowlisted',
          message: `step "${step.id}" writes a path outside the configured allowlist`,
          severity: 'error',
          stepId: step.id,
        });
      }
      break;
    }

    case 'runCommand': {
      if (!matchesCommandAllowlist(step.command, manifest.safety.allowlists.commands)) {
        addFinding(findings, {
          code: 'command.not_allowlisted',
          message: `step "${step.id}" tries to execute "${step.command}" which is not on the allowlist`,
          severity: 'error',
          stepId: step.id,
        });
      }

      if (step.cwd && !matchesPathAllowlist(step.cwd, manifest, context)) {
        addFinding(findings, {
          code: 'command.cwd_not_allowlisted',
          message: `step "${step.id}" uses cwd "${step.cwd}" outside the configured path allowlist`,
          severity: 'error',
          stepId: step.id,
        });
      }

      validateInterpolation(findings, [step.command, ...step.args], step, manifest);
      break;
    }
  }
}

export function evaluateWorkflowPolicy(
  manifest: WorkflowManifest,
  context: PolicyContext,
): PolicyEvaluation {
  const findings: PolicyFinding[] = [];

  for (const step of manifest.steps) {
    validateStepPolicy(findings, step, manifest, context);
  }

  for (const permission of manifest.permissions) {
    const usedByAnyStep = manifest.steps.some(
      (step) => getRequiredPermissionForStep(step) === permission.name,
    );

    if (!usedByAnyStep) {
      addFinding(findings, {
        code: 'permission.unused',
        message: `permission "${permission.name}" is declared but unused by current steps`,
        severity: 'warning',
      });
    }
  }

  return {
    allowed: findings.every((finding) => finding.severity !== 'error'),
    findings,
  };
}

export function assertPolicyEvaluation(evaluation: PolicyEvaluation): void {
  if (evaluation.allowed) {
    return;
  }

  throw new PolicyError(
    'Workflow policy evaluation failed.',
    evaluation.findings.filter((finding) => finding.severity === 'error'),
  );
}

export function summarizeSensitivePermissions(manifest: WorkflowManifest): PermissionName[] {
  return manifest.permissions
    .map((permission) => permission.name)
    .filter((permission): permission is PermissionName => isSensitivePermission(permission));
}

export function stepIsSensitive(step: WorkflowStep): boolean {
  return isSensitivePermission(getRequiredPermissionForStep(step));
}

export function resolveAllowlistedPath(
  candidate: string,
  manifest: WorkflowManifest,
  context: PolicyContext,
): string {
  const resolvedPath = path.resolve(context.workspaceRoot, candidate);

  if (!matchesPathAllowlist(candidate, manifest, context)) {
    throw new PolicyError('Path is outside the configured allowlist.', [
      {
        code: 'filesystem.path_not_allowlisted',
        message: `path "${candidate}" resolves outside the configured allowlist`,
        severity: 'error',
      },
    ]);
  }

  return resolvedPath;
}

export function resolveCommand(
  command: string,
  manifest: WorkflowManifest,
): string {
  if (!matchesCommandAllowlist(command, manifest.safety.allowlists.commands)) {
    throw new PolicyError('Command is outside the configured allowlist.', [
      {
        code: 'command.not_allowlisted',
        message: `command "${command}" is not on the configured allowlist`,
        severity: 'error',
      },
    ]);
  }

  return command;
}
