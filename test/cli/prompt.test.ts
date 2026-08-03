/**
 * Unit tests for the CLI prompt helper — including the EOF race: when
 * stdin closes while a slow request is in flight, the next prompt() call
 * hits an already-closed readline and must resolve null, not crash with
 * ERR_USE_AFTER_CLOSE.
 */
import { describe, it, expect } from 'vitest';
import * as readline from 'node:readline';
import { PassThrough } from 'node:stream';
import { prompt } from '../../src/cli/prompt.js';

function makeRl(): { rl: readline.Interface; input: PassThrough } {
  const input = new PassThrough();
  const output = new PassThrough();
  const rl = readline.createInterface({ input, output });
  return { rl, input };
}

describe('prompt', () => {
  it('resolves the typed line', async () => {
    const { rl, input } = makeRl();
    const answer = prompt(rl, '> ');
    input.write('hello\n');
    await expect(answer).resolves.toBe('hello');
    rl.close();
  });

  it('resolves null when input ends while waiting (EOF)', async () => {
    const { rl, input } = makeRl();
    const answer = prompt(rl, '> ');
    input.end();
    await expect(answer).resolves.toBeNull();
  });

  it('resolves null when called after readline already closed', async () => {
    const { rl } = makeRl();
    rl.close();
    await expect(prompt(rl, '> ')).resolves.toBeNull();
  });
});
