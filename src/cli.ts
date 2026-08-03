/**
 * CLI demo: npm run quote -- --client dental-clinic [--lang en]
 * Works offline with MockIntakeMapper (no API key needed).
 * With ANTHROPIC_API_KEY set, uses ClaudeIntakeMapper.
 */
import * as readline from 'node:readline';
import type { Language } from './domain/types.js';
import { listClientIds, loadClients } from './clients/index.js';
import { createIntakeMapper, getEnv } from './env.js';
import { generateQuote } from './api/generateQuote.js';
import { prompt } from './cli/prompt.js';

function parseArgs(args: string[]): { clientId: string; language: Language } {
  const clientFlag = args.indexOf('--client');
  const langFlag = args.indexOf('--lang');

  const clientId = clientFlag !== -1 ? (args[clientFlag + 1] ?? '') : 'dental-clinic';
  const language = langFlag !== -1 ? (args[langFlag + 1] ?? 'en') : 'en';

  return { clientId, language: language as Language };
}

async function main() {
  const { clientId, language } = parseArgs(process.argv.slice(2));
  const clients = await loadClients();

  const kb = clients[clientId];
  if (!kb) {
    console.error(`Unknown client: "${clientId}". Available: ${listClientIds(clients).join(', ')}`);
    process.exit(1);
  }

  // Detect mapper mode
  const env = getEnv();
  const mapperMode = env.ANTHROPIC_API_KEY ? 'ClaudeIntakeMapper (live)' : 'MockIntakeMapper (offline)';

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║         quotengine CLI demo              ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`Client : ${kb.clientName} (${clientId})`);
  console.log(`Language: ${language}`);
  console.log(`Mapper : ${mapperMode}`);
  console.log(`\nType a customer request (or 'quit' to exit).\n`);

  const mapper = await createIntakeMapper();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (true) {
    const freeText = await prompt(rl, '> ');
    if (freeText === null) break;
    if (freeText.trim().toLowerCase() === 'quit' || freeText.trim() === '') {
      rl.close();
      break;
    }

    try {
      const result = await generateQuote(
        kb,
        { clientId, language, freeText },
        mapper,
        language,
      );
      console.log('\n' + result.text + '\n');
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('Goodbye!');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
