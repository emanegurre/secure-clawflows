import { describe, expect, it } from 'vitest';

import { runCli } from './index.js';

function createIO() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    stdout,
    stderr,
    io: {
      info(message: string) {
        stdout.push(message);
      },
      error(message: string) {
        stderr.push(message);
      },
    },
  };
}

describe('runCli', () => {
  it('prints usage for help', async () => {
    const { stdout, io } = createIO();
    const exitCode = await runCli(['--help'], io);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('secure-clawflows validate <file>');
  });
});
