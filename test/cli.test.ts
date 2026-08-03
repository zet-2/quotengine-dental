/**
 * Integration test for the interactive CLI: piped stdin (one request, then
 * EOF) must produce a quote and exit cleanly — no ERR_USE_AFTER_CLOSE when
 * the prompt loop resumes after readline has closed.
 */
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';

interface CliResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(input: string, args: readonly string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'src/cli.ts', ...args],
      {
        env: { ...process.env, QUOTENGINE_DISABLE_DOTENV: '1', ANTHROPIC_API_KEY: '' },
        timeout: 30_000,
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.write(input);
    child.stdin.end();
  });
}

describe('cli (piped stdin)', () => {
  it('quotes one request then exits cleanly on EOF', async () => {
    const result = await runCli('2 standard implants and a cleaning session\n', [
      '--client',
      'dental-clinic',
      '--lang',
      'en',
    ]);
    expect(result.stderr).not.toContain('ERR_USE_AFTER_CLOSE');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('QUOTE');
    expect(result.stdout).toContain('Standard Implant');
  }, 30_000);

  it('exits with an error listing available clients for an unknown client', async () => {
    const result = await runCli('', ['--client', 'nope', '--lang', 'en']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('dental-clinic');
  }, 30_000);
});
