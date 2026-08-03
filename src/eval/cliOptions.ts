import { resolve } from 'node:path';

export interface EvalCliOptions {
  readonly casesDir: string;
  readonly outputPath?: string;
  readonly minCases: number;
  readonly strict: boolean;
}

function optionValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

export function parseEvalCliOptions(
  argv: readonly string[],
  cwd = process.cwd(),
): EvalCliOptions {
  let casesDir = resolve(cwd, 'eval/cases');
  let outputPath: string | undefined;
  let minCases = 1;
  let strict = false;

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]!;
    if (option === '--strict') {
      strict = true;
      continue;
    }
    if (option === '--cases') {
      casesDir = resolve(cwd, optionValue(argv, index, option));
      index += 1;
      continue;
    }
    if (option === '--output') {
      outputPath = resolve(cwd, optionValue(argv, index, option));
      index += 1;
      continue;
    }
    if (option === '--min-cases') {
      const raw = optionValue(argv, index, option);
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error('--min-cases must be a positive integer');
      }
      minCases = parsed;
      index += 1;
      continue;
    }
    throw new Error(`Unknown eval option: ${option}`);
  }

  return {
    casesDir,
    ...(outputPath ? { outputPath } : {}),
    minCases,
    strict,
  };
}
