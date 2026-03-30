import {
  stepIsSensitive,
  summarizeSensitivePermissions,
  type PolicyEvaluation,
} from '@secure-clawflows/policy-engine';
import {
  getRequiredPermissionForStep,
  type PermissionName,
  type WorkflowManifest,
  type WorkflowStep,
} from '@secure-clawflows/schema';

export interface PlanOptions {
  dryRun?: boolean;
  confirm?: boolean;
}

export interface ExecutionPlanStep {
  id: string;
  type: WorkflowStep['type'];
  summary: string;
  sensitive: boolean;
  permission: PermissionName;
}

export interface ExecutionPlan {
  workflowId: string;
  workflowName: string;
  version: string;
  requestedDryRun: boolean;
  effectiveDryRun: boolean;
  confirmationSatisfied: boolean;
  requiresConfirmation: boolean;
  sensitivePermissions: PermissionName[];
  steps: ExecutionPlanStep[];
  policyFindings: PolicyEvaluation['findings'];
}

export interface WorkflowExplanation {
  workflowId: string;
  description: string;
  permissions: Array<{
    name: PermissionName;
    reason: string;
    sensitive: boolean;
  }>;
  allowlists: WorkflowManifest['safety']['allowlists'];
  limits: WorkflowManifest['safety']['limits'];
  guardrails: WorkflowManifest['safety']['guards'];
}

function summarizeStep(step: WorkflowStep): string {
  switch (step.type) {
    case 'readFile':
      return `Read ${step.path}`;
    case 'writeFile':
      return `Write ${step.path}`;
    case 'runCommand':
      return `Run ${step.command} ${step.args.join(' ')}`.trim();
  }
}

export function resolveRunMode(
  manifest: WorkflowManifest,
  options: PlanOptions,
): {
  requestedDryRun: boolean;
  effectiveDryRun: boolean;
  requiresConfirmation: boolean;
  confirmationSatisfied: boolean;
} {
  const requestedDryRun = options.dryRun ?? false;
  const requiresConfirmation =
    manifest.safety.requireExplicitConfirmation &&
    manifest.steps.some((step) => stepIsSensitive(step));
  const confirmationSatisfied = !requiresConfirmation || options.confirm === true;
  const effectiveDryRun =
    requestedDryRun ||
    (manifest.safety.dryRunByDefault && requiresConfirmation && !confirmationSatisfied);

  return {
    requestedDryRun,
    effectiveDryRun,
    requiresConfirmation,
    confirmationSatisfied,
  };
}

export function createExecutionPlan(
  manifest: WorkflowManifest,
  policyEvaluation: PolicyEvaluation,
  options: PlanOptions,
): ExecutionPlan {
  const runMode = resolveRunMode(manifest, options);

  return {
    workflowId: manifest.id,
    workflowName: manifest.name,
    version: manifest.version,
    requestedDryRun: runMode.requestedDryRun,
    effectiveDryRun: runMode.effectiveDryRun,
    confirmationSatisfied: runMode.confirmationSatisfied,
    requiresConfirmation: runMode.requiresConfirmation,
    sensitivePermissions: summarizeSensitivePermissions(manifest),
    steps: manifest.steps.map((step) => ({
      id: step.id,
      type: step.type,
      summary: summarizeStep(step),
      sensitive: stepIsSensitive(step),
      permission: getRequiredPermissionForStep(step),
    })),
    policyFindings: policyEvaluation.findings,
  };
}

export function explainWorkflow(manifest: WorkflowManifest): WorkflowExplanation {
  return {
    workflowId: manifest.id,
    description: manifest.description,
    permissions: manifest.permissions.map((permission) => ({
      name: permission.name,
      reason: permission.reason,
      sensitive: summarizeSensitivePermissions(manifest).includes(permission.name),
    })),
    allowlists: manifest.safety.allowlists,
    limits: manifest.safety.limits,
    guardrails: manifest.safety.guards,
  };
}
