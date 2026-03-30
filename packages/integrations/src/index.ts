import type { WorkflowManifest } from '@secure-clawflows/schema';

export interface OpenClawContextSnapshot {
  workspaceId?: string;
  sessionId?: string;
  actorId?: string;
  metadata?: Record<string, string>;
}

export interface OpenClawContextProvider {
  readContext(_manifest: WorkflowManifest): Promise<OpenClawContextSnapshot>;
}

export class NoopOpenClawContextProvider implements OpenClawContextProvider {
  async readContext(_manifest: WorkflowManifest): Promise<OpenClawContextSnapshot> {
    return {};
  }
}
