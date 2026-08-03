/**
 * formatExistingRestorations — a localized, patient-facing transparency note listing
 * what is ALREADY in the mouth and stating the estimate covers new work only.
 * Pure; returns null when there is nothing to report.
 */
import type { Language } from '../domain/types.js';
import type { ExistingRestoration, RestorationType, Arch } from './types.js';

const TYPE_LABELS: Record<Language, Record<RestorationType, string>> = {
  it: { implant: 'impianto', crown: 'corona', bridge: 'ponte', post: 'perno', denture: 'protesi', other: 'restauro' },
  en: { implant: 'implant', crown: 'crown', bridge: 'bridge', post: 'post', denture: 'denture', other: 'restoration' },
  sq: { implant: 'implant', crown: 'kurorë', bridge: 'urë', post: 'bazament', denture: 'protezë', other: 'restaurim' },
};

const ARCH_LABELS: Record<Language, Record<Arch, string>> = {
  it: { upper: 'superiore', lower: 'inferiore' },
  en: { upper: 'upper', lower: 'lower' },
  sq: { upper: 'sipërme', lower: 'poshtme' },
};

const FRAME: Record<Language, { lead: string; tail: string }> = {
  it: { lead: 'Restauri esistenti osservati', tail: 'Il preventivo copre solo il lavoro nuovo.' },
  en: { lead: 'Existing restorations observed', tail: 'The estimate covers new work only.' },
  sq: { lead: 'Restaurime ekzistuese të vërejtura', tail: 'Oferta mbulon vetëm punën e re.' },
};

export function formatExistingRestorations(
  restorations: readonly ExistingRestoration[] | undefined,
  language: Language,
): string | null {
  if (!restorations || restorations.length === 0) return null;

  const typeLabels = TYPE_LABELS[language] ?? TYPE_LABELS.en;
  const archLabels = ARCH_LABELS[language] ?? ARCH_LABELS.en;
  const frame = FRAME[language] ?? FRAME.en;

  const items = restorations
    .map((r) => {
      const arch = r.arch ? ` (${archLabels[r.arch]})` : '';
      return `${r.count}× ${typeLabels[r.type]}${arch}`;
    })
    .join(', ');

  return `${frame.lead}: ${items}. ${frame.tail}`;
}
