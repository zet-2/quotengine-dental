import { describe, expect, it } from 'vitest';
import { parseEvalCliOptions } from '../../src/eval/cliOptions.js';

describe('parseEvalCliOptions', () => {
  it('parses reproducible-report and evaluation-gate options', () => {
    expect(parseEvalCliOptions([
      '--cases',
      'fixtures',
      '--output',
      'reports/live.json',
      '--min-cases',
      '25',
      '--strict',
    ], '/project')).toEqual({
      casesDir: '/project/fixtures',
      outputPath: '/project/reports/live.json',
      minCases: 25,
      strict: true,
    });
  });

  it('defaults to the local fixture without overstating its case count', () => {
    expect(parseEvalCliOptions([], '/project')).toEqual({
      casesDir: '/project/eval/cases',
      minCases: 1,
      strict: false,
    });
  });

  it.each([
    [['--output'], '--output requires a value'],
    [['--min-cases', '0'], 'positive integer'],
    [['--min-cases', '1.5'], 'positive integer'],
    [['--typo'], 'Unknown eval option'],
  ])('rejects invalid options %#', (argv, message) => {
    expect(() => parseEvalCliOptions(argv, '/project')).toThrow(message);
  });
});
