import type { Language } from '../domain/types.js';
import type { PatientTargetArea } from './patientIntent.js';
import type { DentalQuoteResult } from './generateDentalQuote.js';

export const COMMERCIAL_CATALOG_VERSION = '2026-08-03.demo-v1';
/** Updated from the canonical catalog payload; CI rejects content drift. */
export const COMMERCIAL_CATALOG_APPROVAL_ID =
  'sha256:982494ae5a8b4ce98297a993beda1644959126df3c8029bf5408bd0b92ac6fb4';
/** Synthetic prices and unconfirmed tax/terms can never pass the production gate. */
export const COMMERCIAL_CATALOG_PRODUCTION_READY = false;
export const COMMERCIAL_CATALOG_BASIS = 'synthetic_demo_catalog_not_clinic_price' as const;

export interface MoneyRange {
  readonly low: number;
  readonly high: number;
}

export interface CommercialEstimateTerms {
  readonly basis: typeof COMMERCIAL_CATALOG_BASIS;
  readonly inclusions: readonly string[];
  readonly assumptions: readonly string[];
  readonly exclusions: readonly string[];
  readonly tax: {
    readonly status: 'not_confirmed';
    readonly note: string;
  };
  readonly validity: {
    readonly status: 'temporary_until_clinic_catalog_approval';
    readonly note: string;
  };
}

export interface CommercialEstimate {
  readonly scenarioId: 'fixed-full-arch-standard';
  readonly catalogVersion: typeof COMMERCIAL_CATALOG_VERSION;
  readonly pricingStatus: 'synthetic_demo_catalog';
  readonly catalogScope: 'example_dental_practice';
  readonly targetArea: PatientTargetArea;
  readonly archCount: 1 | 2;
  readonly currency: 'EUR';
  readonly unit: 'per_arch';
  readonly unitRange: MoneyRange;
  readonly totalRange: MoneyRange;
  readonly terms: CommercialEstimateTerms;
}

interface FullArchCatalogEntry {
  readonly scenarioId: CommercialEstimate['scenarioId'];
  readonly version: typeof COMMERCIAL_CATALOG_VERSION;
  readonly status: CommercialEstimate['pricingStatus'];
  readonly catalogScope: CommercialEstimate['catalogScope'];
  readonly currency: CommercialEstimate['currency'];
  readonly unit: CommercialEstimate['unit'];
  readonly unitRange: MoneyRange;
}

/**
 * Synthetic demonstration catalog, intentionally isolated from the clinical item KB.
 * Replace this entry before use with a practice-approved gross price list.
 */
export const DEMO_FULL_ARCH_STANDARD: FullArchCatalogEntry = Object.freeze({
  scenarioId: 'fixed-full-arch-standard',
  version: COMMERCIAL_CATALOG_VERSION,
  status: 'synthetic_demo_catalog',
  catalogScope: 'example_dental_practice',
  currency: 'EUR',
  unit: 'per_arch',
  unitRange: Object.freeze({ low: 2_700, high: 4_000 }),
});

const DISCLAIMERS: Record<Language, string> = {
  it: 'Fascia dimostrativa basata su un catalogo sintetico, non su prezzi di mercato né sul listino di una clinica. È una stima indicativa e non vincolante; non è una diagnosi né una conferma di idoneità. Il piano e il prezzo finale saranno definiti dopo la valutazione clinica.',
  en: 'Demonstration range based on a synthetic catalog, not market prices or a clinic price list. It is an indicative, non-binding estimate; it is neither a diagnosis nor confirmation of eligibility. The treatment plan and final price will be defined after clinical assessment.',
  sq: 'Interval demonstrues i bazuar në një katalog sintetik, jo në çmimet e tregut ose në listën e çmimeve të një klinike. Është një vlerësim orientues dhe jo-detyrues; nuk është diagnozë ose konfirmim përshtatshmërie. Plani dhe çmimi përfundimtar përcaktohen pas vlerësimit klinik.',
};

const TERMS: Record<Language, Omit<CommercialEstimateTerms, 'basis'>> = {
  it: {
    inclusions: [
      'Una soluzione fissa standard per ciascuna arcata selezionata; componenti e materiali specifici restano da confermare.',
    ],
    assumptions: [
      'Idoneità, componenti, materiali e numero di impianti non sono ancora determinati.',
    ],
    exclusions: [
      'Estrazioni e trattamenti pre-implantari, inclusi innesti e rialzi del seno.',
      'Sedazione e upgrade protesici o di materiale.',
    ],
    tax: {
      status: 'not_confirmed',
      note: 'IVA e regime fiscale saranno definiti nel listino approvato dalla clinica.',
    },
    validity: {
      status: 'temporary_until_clinic_catalog_approval',
      note: 'Dato dimostrativo da sostituire con il listino approvato dallo studio prima di qualsiasi uso reale.',
    },
  },
  en: {
    inclusions: [
      'One standard fixed solution for each selected arch; specific components and materials remain to be confirmed.',
    ],
    assumptions: [
      'Eligibility, components, materials and implant count have not yet been determined.',
    ],
    exclusions: [
      'Extractions and pre-implant procedures, including grafts and sinus lifts.',
      'Sedation and prosthetic or material upgrades.',
    ],
    tax: {
      status: 'not_confirmed',
      note: 'VAT and tax treatment will be defined in the clinic-approved price list.',
    },
    validity: {
      status: 'temporary_until_clinic_catalog_approval',
      note: 'Demo data that must be replaced with the practice-approved price list before any real use.',
    },
  },
  sq: {
    inclusions: [
      'Një zgjidhje fikse standarde për çdo hark të zgjedhur; komponentët dhe materialet specifike mbeten për t’u konfirmuar.',
    ],
    assumptions: [
      'Përshtatshmëria, komponentët, materialet dhe numri i implanteve nuk janë përcaktuar ende.',
    ],
    exclusions: [
      'Nxjerrjet dhe trajtimet para implantit, përfshirë graftet dhe sinus lift.',
      'Sedacioni dhe përmirësimet protetike ose të materialit.',
    ],
    tax: {
      status: 'not_confirmed',
      note: 'TVSH-ja dhe trajtimi fiskal do të përcaktohen në listën e çmimeve të miratuar nga klinika.',
    },
    validity: {
      status: 'temporary_until_clinic_catalog_approval',
      note: 'Të dhëna demonstrimi që duhet të zëvendësohen me listën e miratuar të çmimeve para çdo përdorimi real.',
    },
  },
};

/** Stable content used to bind an explicit production approval to prices and every translated term. */
export function commercialCatalogApprovalPayload(): string {
  return JSON.stringify({
    entry: DEMO_FULL_ARCH_STANDARD,
    basis: COMMERCIAL_CATALOG_BASIS,
    disclaimers: DISCLAIMERS,
    terms: TERMS,
    productionReady: COMMERCIAL_CATALOG_PRODUCTION_READY,
  });
}

export function createDemoFullArchEstimate(
  targetArea: PatientTargetArea,
  language: Language = 'en',
): CommercialEstimate {
  const archCount = targetArea === 'both' ? 2 : 1;
  const terms = TERMS[language] ?? TERMS.en;
  return {
    scenarioId: DEMO_FULL_ARCH_STANDARD.scenarioId,
    catalogVersion: DEMO_FULL_ARCH_STANDARD.version,
    pricingStatus: DEMO_FULL_ARCH_STANDARD.status,
    catalogScope: DEMO_FULL_ARCH_STANDARD.catalogScope,
    targetArea,
    archCount,
    currency: DEMO_FULL_ARCH_STANDARD.currency,
    unit: DEMO_FULL_ARCH_STANDARD.unit,
    unitRange: { ...DEMO_FULL_ARCH_STANDARD.unitRange },
    totalRange: {
      low: DEMO_FULL_ARCH_STANDARD.unitRange.low * archCount,
      high: DEMO_FULL_ARCH_STANDARD.unitRange.high * archCount,
    },
    terms: {
      basis: COMMERCIAL_CATALOG_BASIS,
      inclusions: [...terms.inclusions],
      assumptions: [...terms.assumptions],
      exclusions: [...terms.exclusions],
      tax: { ...terms.tax },
      validity: { ...terms.validity },
    },
  };
}

export function demoCommercialDisclaimer(language: Language): string {
  return DISCLAIMERS[language] ?? DISCLAIMERS.en;
}

export function createDemoFullArchResult(
  targetArea: PatientTargetArea,
  language: Language,
): DentalQuoteResult {
  return {
    resultBasis: 'commercial_scenario',
    assessment: null,
    requiresClinicalConfirmation: true,
    disclaimer: demoCommercialDisclaimer(language),
    consultationOnly: false,
    quote: null,
    text: null,
    json: null,
    priceRange: null,
    commercialEstimate: createDemoFullArchEstimate(targetArea, language),
  };
}
