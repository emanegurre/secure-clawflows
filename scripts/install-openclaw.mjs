import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const START_MARKER = '<!-- secure-clawflows:start -->';
const END_MARKER = '<!-- secure-clawflows:end -->';

function resolveRepoRoot() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDir, '..');
}

function detectOpenClawWorkspace() {
  const defaultWorkspace = path.join(os.homedir(), '.openclaw', 'workspace');
  const configFile = path.join(os.homedir(), '.openclaw', 'openclaw.json');

  if (!fs.existsSync(configFile)) {
    return defaultWorkspace;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    return typeof parsed.workspace === 'string' && parsed.workspace.trim().length > 0
      ? parsed.workspace
      : defaultWorkspace;
  } catch {
    return defaultWorkspace;
  }
}

function ensureBuilt(repoRoot) {
  execFileSync('corepack', ['pnpm', 'install'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  execFileSync('corepack', ['pnpm', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function writeCliShim(repoRoot) {
  const cliEntry = path.join(repoRoot, 'packages', 'cli', 'dist', 'bin.js');
  const binDir = path.join(os.homedir(), '.local', 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  if (process.platform === 'win32') {
    const cmdFile = path.join(binDir, 'secure-clawflows.cmd');
    const content = `@echo off\r\nnode "${cliEntry}" %*\r\n`;
    fs.writeFileSync(cmdFile, content, 'utf8');
    return cmdFile;
  }

  const shimFile = path.join(binDir, 'secure-clawflows');
  const content = `#!/usr/bin/env bash\nnode "${cliEntry}" "$@"\n`;
  fs.writeFileSync(shimFile, content, { encoding: 'utf8', mode: 0o755 });
  fs.chmodSync(shimFile, 0o755);
  return shimFile;
}

function buildAgentsBlock(repoRoot, shimPath, workspace) {
  return [
    START_MARKER,
    '## secure-clawflows',
    '',
    `Security-first workflow runtime available from \`${shimPath}\`.`,
    `Repository root: \`${repoRoot}\``,
    `OpenClaw workspace: \`${workspace}\``,
    '',
    'Use it when the user wants workflow validation, planning, dry-runs, execution, or audit log review.',
    '',
    'Commands:',
    '- `secure-clawflows validate <file>`',
    '- `secure-clawflows plan <file>`',
    '- `secure-clawflows run <file> --dry-run`',
    '- `secure-clawflows explain <file>`',
    '- `secure-clawflows permissions <file>`',
    '- `secure-clawflows logs`',
    '- `secure-clawflows doctor`',
    '',
    'Defaults:',
    '- sensitive operations should stay in dry-run unless the user explicitly wants a confirmed real run',
    '- manifests must be reviewed through policy validation before execution',
    '- secrets must stay outside workflow manifests',
    END_MARKER,
    '',
  ].join('\n');
}

function syncAgentsMd(workspace, block) {
  const agentsFile = path.join(workspace, 'AGENTS.md');
  fs.mkdirSync(path.dirname(agentsFile), { recursive: true });

  const current = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, 'utf8') : '';
  const startIndex = current.indexOf(START_MARKER);
  const endIndex = current.indexOf(END_MARKER);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = current.slice(0, startIndex).trimEnd();
    const after = current.slice(endIndex + END_MARKER.length).trimStart();
    const merged = [before, block.trimEnd(), after].filter(Boolean).join('\n\n') + '\n';
    fs.writeFileSync(agentsFile, merged, 'utf8');
    return agentsFile;
  }

  const prefix = current.trimEnd();
  const merged = [prefix, block.trimEnd()].filter(Boolean).join('\n\n') + '\n';
  fs.writeFileSync(agentsFile, merged, 'utf8');
  return agentsFile;
}

function main() {
  const repoRoot = resolveRepoRoot();
  const workspace = detectOpenClawWorkspace();

  console.log('Installing secure-clawflows for OpenClaw...');
  ensureBuilt(repoRoot);
  const shimPath = writeCliShim(repoRoot);
  const agentsFile = syncAgentsMd(workspace, buildAgentsBlock(repoRoot, shimPath, workspace));

  console.log('');
  console.log(`CLI shim: ${shimPath}`);
  console.log(`AGENTS.md: ${agentsFile}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Ensure ~/.local/bin is on PATH if needed');
  console.log('  2. Re-read AGENTS.md in OpenClaw');
  console.log('  3. Run secure-clawflows doctor');
  console.log('  4. Validate a workflow before running it');
}

main();
