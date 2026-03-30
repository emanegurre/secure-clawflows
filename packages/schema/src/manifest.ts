import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { z, type ZodIssue } from 'zod';

export const permissionNames = [
  'filesystem.read',
  'filesystem.write',
  'command.exec',
  'network.http',
  'secrets.read',
  'openclaw.context.read',
] as const;

export const stepTypes = ['readFile', 'writeFile', 'runCommand'] as const;

export const permissionNameSchema = z.enum(permissionNames);

const identifierSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'must use letters, numbers, ".", "_" or "-"');

const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'must follow the format x.y.z');

const baseStepSchema = z
  .object({
    id: identifierSchema,
    name: z.string().min(1).max(200).optional(),
    onFailure: z.enum(['abort', 'continue']).default('abort'),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict();

const readFileStepSchema = baseStepSchema
  .extend({
    type: z.literal('readFile'),
    path: z.string().min(1),
    encoding: z.enum(['utf8', 'base64']).default('utf8'),
    maxBytes: z.number().int().positive().optional(),
  })
  .strict();

const writeFileStepSchema = baseStepSchema
  .extend({
    type: z.literal('writeFile'),
    path: z.string().min(1),
    content: z.string(),
    ifExists: z.enum(['error', 'overwrite', 'append']).default('error'),
  })
  .strict();

const runCommandStepSchema = baseStepSchema
  .extend({
    type: z.literal('runCommand'),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    cwd: z.string().min(1).optional(),
    captureOutput: z.boolean().default(true),
  })
  .strict();

export const workflowStepSchema = z.discriminatedUnion('type', [
  readFileStepSchema,
  writeFileStepSchema,
  runCommandStepSchema,
]);

const permissionSchema = z
  .object({
    name: permissionNameSchema,
    reason: z.string().min(10).max(500),
    required: z.boolean().default(true),
  })
  .strict();

const inputDefinitionSchema = z
  .object({
    name: identifierSchema,
    type: z.enum(['string', 'number', 'boolean', 'path']),
    description: z.string().min(1).max(300),
    required: z.boolean().default(false),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    sensitive: z.boolean().default(false),
  })
  .strict();

const triggerSchema = z
  .object({
    type: z.literal('manual'),
    description: z.string().min(1).max(300).optional(),
  })
  .strict();

const outputDefinitionSchema = z
  .object({
    name: identifierSchema,
    description: z.string().min(1).max(300),
    fromStep: identifierSchema,
  })
  .strict();

const rollbackSchema = z
  .object({
    steps: z.array(workflowStepSchema),
  })
  .strict();

const safetySchema = z
  .object({
    dryRunByDefault: z.boolean(),
    requireExplicitConfirmation: z.boolean(),
    allowlists: z
      .object({
        commands: z.array(z.string().min(1)),
        paths: z.array(z.string().min(1)).min(1),
        hosts: z.array(z.string().min(1)),
      })
      .strict(),
    limits: z
      .object({
        stepTimeoutMs: z.number().int().positive(),
        maxOutputBytes: z.number().int().positive(),
      })
      .strict(),
    guards: z
      .object({
        blockUnsafeShellInterpolation: z.boolean(),
        redactSecrets: z.boolean(),
      })
      .strict(),
  })
  .strict();

const auditSchema = z
  .object({
    logFile: z.string().min(1),
    includePlan: z.boolean(),
    includeEnvironment: z.boolean(),
  })
  .strict();

const requiredPermissionByStepType = {
  readFile: 'filesystem.read',
  writeFile: 'filesystem.write',
  runCommand: 'command.exec',
} as const;

export const workflowManifestSchema = z
  .object({
    id: identifierSchema,
    name: z.string().min(3).max(200),
    version: semverSchema,
    description: z.string().min(20).max(2_000),
    permissions: z.array(permissionSchema).min(1),
    inputs: z.array(inputDefinitionSchema),
    triggers: z.array(triggerSchema).min(1),
    steps: z.array(workflowStepSchema).min(1),
    outputs: z.array(outputDefinitionSchema),
    rollback: rollbackSchema,
    safety: safetySchema,
    audit: auditSchema,
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const stepIds = new Set<string>();
    const rollbackIds = new Set<string>();
    const permissions = new Set(manifest.permissions.map((permission) => permission.name));

    for (const [index, step] of manifest.steps.entries()) {
      if (stepIds.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate step id "${step.id}"`,
          path: ['steps', index, 'id'],
        });
      }

      stepIds.add(step.id);

      const requiredPermission = requiredPermissionByStepType[step.type];
      if (!permissions.has(requiredPermission)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `missing permission "${requiredPermission}" required by step "${step.id}"`,
          path: ['steps', index],
        });
      }
    }

    for (const [index, step] of manifest.rollback.steps.entries()) {
      if (rollbackIds.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate rollback step id "${step.id}"`,
          path: ['rollback', 'steps', index, 'id'],
        });
      }

      rollbackIds.add(step.id);
    }

    for (const [index, output] of manifest.outputs.entries()) {
      if (!stepIds.has(output.fromStep)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `output references unknown step "${output.fromStep}"`,
          path: ['outputs', index, 'fromStep'],
        });
      }
    }

    // TODO(v2): extend the manifest schema with cryptographic signature metadata.
  });

export type PermissionName = z.infer<typeof permissionNameSchema>;
export type WorkflowManifest = z.infer<typeof workflowManifestSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type ReadFileStep = z.infer<typeof readFileStepSchema>;
export type WriteFileStep = z.infer<typeof writeFileStepSchema>;
export type RunCommandStep = z.infer<typeof runCommandStepSchema>;

function formatIssue(issue: ZodIssue): string {
  const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`;
}

export class WorkflowManifestError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = 'WorkflowManifestError';
    this.issues = issues;
  }
}

export function safeParseWorkflowManifest(
  source: string,
):
  | { success: true; data: WorkflowManifest }
  | { success: false; error: WorkflowManifestError } {
  let parsed: unknown;

  try {
    parsed = parseYaml(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse YAML.';
    return {
      success: false,
      error: new WorkflowManifestError('Workflow manifest is not valid YAML.', [message]),
    };
  }

  const result = workflowManifestSchema.safeParse(parsed);

  if (!result.success) {
    return {
      success: false,
      error: new WorkflowManifestError(
        'Workflow manifest validation failed.',
        result.error.issues.map(formatIssue),
      ),
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

export function parseWorkflowManifest(source: string): WorkflowManifest {
  const result = safeParseWorkflowManifest(source);

  if (!result.success) {
    throw result.error;
  }

  return result.data;
}

export async function loadWorkflowManifest(filePath: string): Promise<WorkflowManifest> {
  const source = await readFile(filePath, 'utf8');
  return parseWorkflowManifest(source);
}

export function getRequiredPermissionForStep(step: WorkflowStep): PermissionName {
  return requiredPermissionByStepType[step.type];
}

export function isWorkflowStep(value: unknown): value is WorkflowStep {
  return workflowStepSchema.safeParse(value).success;
}

export function isSensitivePermission(permission: PermissionName): boolean {
  return permission === 'filesystem.write' || permission === 'command.exec' || permission === 'secrets.read';
}
