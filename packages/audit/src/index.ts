import { mkdir, readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

export interface AuditEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  workflowId?: string;
  stepId?: string;
  dryRun?: boolean;
  details?: Record<string, unknown>;
}

const redactedKeys = new Set(['authorization', 'password', 'secret', 'token']);

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => {
        if (redactedKeys.has(key.toLowerCase())) {
          return [key, '[REDACTED]'];
        }

        return [key, redactValue(nestedValue)];
      }),
    );
  }

  return value;
}

export class JsonLineAuditLogger {
  constructor(private readonly logFile: string) {}

  async log(event: Omit<AuditEvent, 'timestamp'>): Promise<void> {
    const payload: AuditEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      details: event.details ? (redactValue(event.details) as Record<string, unknown>) : undefined,
    };

    await mkdir(path.dirname(this.logFile), { recursive: true });
    await appendFile(this.logFile, `${JSON.stringify(payload)}\n`, 'utf8');
  }

  async read(limit = 50): Promise<AuditEvent[]> {
    try {
      const content = await readFile(this.logFile, 'utf8');

      return content
        .trim()
        .split('\n')
        .filter(Boolean)
        .slice(-limit)
        .map((line) => JSON.parse(line) as AuditEvent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  getLogFile(): string {
    return this.logFile;
  }
}
