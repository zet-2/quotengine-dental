/**
 * Quotengine Demo Dental Practice — synthetic knowledge base
 * Synthetic catalog for demonstrating per-practice configuration.
 */
import { loadKnowledgeBase } from '../kb/KnowledgeBase.js';
import type { KnowledgeBase } from '../domain/types.js';

const raw = {
  clientId: 'dental-clinic',
  clientName: 'Quotengine Demo Dental Practice',
  languages: ['it', 'sq', 'en'],
  defaultLanguage: 'en',
  currency: 'EUR',
  items: [
    // ─── Implants ───────────────────────────────────────────────────────────
    {
      id: 'implant-standard',
      name: {
        it: 'Impianto Standard',
        sq: 'Implant Standard',
        en: 'Standard Implant',
      },
      unit: 'tooth',
      unitPrice: 450,
      laborHoursPerUnit: 2,
      category: 'implants',
      exclusiveGroup: 'implant-system',
    },
    {
      id: 'implant-premium',
      name: {
        it: 'Sistema Implantare Premium',
        sq: 'Sistem Implanti Premium',
        en: 'Premium Implant System',
      },
      unit: 'tooth',
      unitPrice: 750,
      laborHoursPerUnit: 2.5,
      category: 'implants',
      exclusiveGroup: 'implant-system',
    },
    // ─── Crowns ─────────────────────────────────────────────────────────────
    {
      id: 'crown-porcelain',
      name: {
        it: 'Corona in Ceramica',
        sq: 'Kurorë Porcelani',
        en: 'Porcelain Crown',
      },
      unit: 'tooth',
      unitPrice: 220,
      laborHoursPerUnit: 1,
      category: 'crowns',
      exclusiveGroup: 'crown-material',
    },
    {
      id: 'crown-zirconia',
      name: {
        it: 'Corona in Zirconio',
        sq: 'Kurorë Zirkoni',
        en: 'Zirconia Crown',
      },
      unit: 'tooth',
      unitPrice: 320,
      laborHoursPerUnit: 1.2,
      category: 'crowns',
      exclusiveGroup: 'crown-material',
    },
    // ─── Veneers ────────────────────────────────────────────────────────────
    {
      id: 'veneer-composite',
      name: {
        it: 'Faccetta in Composito',
        sq: 'Faseta Kompozite',
        en: 'Composite Veneer',
      },
      unit: 'tooth',
      unitPrice: 150,
      laborHoursPerUnit: 0.75,
      category: 'veneers',
      exclusiveGroup: 'veneer-material',
    },
    {
      id: 'veneer-porcelain',
      name: {
        it: 'Faccetta in Ceramica',
        sq: 'Faseta Porcelani',
        en: 'Porcelain Veneer',
      },
      unit: 'tooth',
      unitPrice: 280,
      laborHoursPerUnit: 1.5,
      category: 'veneers',
      exclusiveGroup: 'veneer-material',
    },
    // ─── General ─────────────────────────────────────────────────────────────
    {
      id: 'extraction',
      name: {
        it: 'Estrazione Dentale',
        sq: 'Heqje Dhëmbi',
        en: 'Tooth Extraction',
      },
      unit: 'tooth',
      unitPrice: 60,
      laborHoursPerUnit: 0.5,
      category: 'general',
    },
    {
      id: 'cleaning',
      name: {
        it: 'Igiene Dentale Professionale',
        sq: 'Pastrim Profesional Dhëmbësh',
        en: 'Professional Teeth Cleaning',
      },
      unit: 'session',
      unitPrice: 50,
      laborHoursPerUnit: 1,
      category: 'general',
    },
    {
      id: 'xray-panoramic',
      name: {
        it: 'Radiografia Panoramica',
        sq: 'Radiografi Panoramike',
        en: 'Panoramic X-Ray',
      },
      unit: 'unit',
      unitPrice: 40,
      laborHoursPerUnit: 0.25,
      category: 'diagnostics',
    },
  ],
  rules: [
    {
      kind: 'laborHourlyRate',
      value: 40,
      label: {
        it: 'Tariffa oraria medico',
        sq: 'Tarifa orare mjek',
        en: 'Doctor hourly rate',
      },
    },
  ],
  modifiers: [
    {
      id: 'urgency-surcharge',
      label: {
        it: 'Supplemento urgenza',
        sq: 'Shtesë urgjence',
        en: 'Urgency surcharge',
      },
      type: 'percentage',
      value: 15,
    },
  ],
  markupPercent: 0,
  taxPercent: 0,
  notes: {
    it: 'Catalogo dimostrativo: sostituire prezzi, imposte e condizioni con i dati approvati dallo studio.',
    sq: 'Katalog demonstrues: zëvendësoni çmimet, taksat dhe kushtet me të dhënat e miratuara nga klinika.',
    en: 'Demo catalog: replace prices, taxes and terms with practice-approved data before use.',
  },
};

export const dentalClinicKB: KnowledgeBase = loadKnowledgeBase(raw);
