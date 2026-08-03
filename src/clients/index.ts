import { readdirSync } from 'node:fs';
import { basename, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KnowledgeBase } from '../domain/types.js';

export type ClientRegistry = Readonly<Record<string, KnowledgeBase>>;

let cachedClients: ClientRegistry | null = null;

function isKnowledgeBase(value: unknown): value is KnowledgeBase {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<KnowledgeBase>;
  return (
    typeof candidate.clientId === 'string' &&
    typeof candidate.clientName === 'string' &&
    Array.isArray(candidate.items) &&
    Array.isArray(candidate.rules) &&
    Array.isArray(candidate.modifiers)
  );
}

function clientModuleNames(): readonly string[] {
  const dir = dirname(fileURLToPath(import.meta.url));
  return readdirSync(dir)
    .filter((file) => {
      if (file.startsWith('index.')) return false;
      if (file.endsWith('.d.ts') || file.endsWith('.map')) return false;
      const ext = extname(file);
      return ext === '.ts' || ext === '.js';
    })
    .map((file) => basename(file, extname(file)))
    .filter((moduleName, index, moduleNames) => moduleNames.indexOf(moduleName) === index)
    .sort();
}

/** Pure: build a frozen registry from KBs, rejecting duplicates and empty input */
export function buildRegistry(kbs: readonly KnowledgeBase[]): ClientRegistry {
  const clients: Record<string, KnowledgeBase> = {};
  for (const kb of kbs) {
    if (clients[kb.clientId]) {
      throw new Error(`Duplicate clientId '${kb.clientId}' in client registry`);
    }
    clients[kb.clientId] = kb;
  }

  if (Object.keys(clients).length === 0) {
    throw new Error('No client knowledge bases found in src/clients');
  }

  return Object.freeze(clients);
}

export async function loadClients(): Promise<ClientRegistry> {
  if (cachedClients) return cachedClients;

  const discovered: KnowledgeBase[] = [];
  for (const moduleName of clientModuleNames()) {
    const mod: Record<string, unknown> = await import(/* @vite-ignore */ `./${moduleName}.js`);
    discovered.push(...Object.values(mod).filter(isKnowledgeBase));
  }

  cachedClients = buildRegistry(discovered);
  return cachedClients;
}

export function listClientIds(clients: ClientRegistry): readonly string[] {
  return Object.keys(clients).sort();
}
