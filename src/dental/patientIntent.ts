import type { Language } from '../domain/types.js';

export const PATIENT_TREATMENT_GOALS = [
  'replace_few_teeth',
  'restore_teeth',
  'improve_smile',
  'fixed_full_arch',
  'existing_plan',
  'unsure',
] as const;

export const PATIENT_TARGET_AREAS = ['upper', 'lower', 'both'] as const;

export type PatientTreatmentGoal = (typeof PATIENT_TREATMENT_GOALS)[number];
export type PatientTargetArea = (typeof PATIENT_TARGET_AREAS)[number];

export interface PatientDentalIntent {
  readonly treatmentGoal: PatientTreatmentGoal;
  readonly targetArea: PatientTargetArea;
}

const GOAL_PROMPTS: Record<Language, Record<PatientTreatmentGoal, string>> = {
  it: {
    replace_few_teeth: 'Vorrei sostituire da uno a tre denti mancanti con una soluzione fissa.',
    restore_teeth: 'Vorrei restaurare denti presenti, usurati o danneggiati con corone.',
    improve_smile: 'Vorrei migliorare il sorriso e valutare corone o faccette.',
    fixed_full_arch: 'Vorrei una soluzione fissa per un’intera arcata.',
    existing_plan: 'Ho già un piano di trattamento e voglio una stima basata su quel piano.',
    unsure: 'Non so quale trattamento mi serva e desidero capire le opzioni.',
  },
  en: {
    replace_few_teeth: 'I want to replace one to three missing teeth with a fixed solution.',
    restore_teeth: 'I want to restore present, worn or damaged teeth with crowns.',
    improve_smile: 'I want to improve my smile and consider crowns or veneers.',
    fixed_full_arch: 'I want a fixed solution for a complete arch.',
    existing_plan: 'I already have a treatment plan and want an estimate based on it.',
    unsure: 'I am unsure which treatment I need and want to understand the options.',
  },
  sq: {
    replace_few_teeth: 'Dua të zëvendësoj një deri në tre dhëmbë që mungojnë me një zgjidhje fikse.',
    restore_teeth: 'Dua të restauroj dhëmbët ekzistues, të konsumuar ose të dëmtuar me kurora.',
    improve_smile: 'Dua të përmirësoj buzëqeshjen dhe të shqyrtoj kurora ose faseta.',
    fixed_full_arch: 'Dua një zgjidhje fikse për një hark të plotë.',
    existing_plan: 'Kam tashmë një plan trajtimi dhe dua një vlerësim bazuar në të.',
    unsure: 'Nuk e di cili trajtim më duhet dhe dua të kuptoj opsionet.',
  },
};

const TARGET_PROMPTS: Record<Language, Record<PatientTargetArea, string>> = {
  it: { upper: 'arcata superiore', lower: 'arcata inferiore', both: 'entrambe le arcate' },
  en: { upper: 'upper arch', lower: 'lower arch', both: 'both arches' },
  sq: { upper: 'harku i sipërm', lower: 'harku i poshtëm', both: 'të dy harqet' },
};

export function isPatientTreatmentGoal(value: unknown): value is PatientTreatmentGoal {
  return typeof value === 'string' &&
    (PATIENT_TREATMENT_GOALS as readonly string[]).includes(value);
}

export function isPatientTargetArea(value: unknown): value is PatientTargetArea {
  return typeof value === 'string' &&
    (PATIENT_TARGET_AREAS as readonly string[]).includes(value);
}

export function buildPatientIntentText(
  goal: PatientTreatmentGoal,
  targetArea: PatientTargetArea,
  details: string,
  language: Language,
): string {
  const goalCopy = GOAL_PROMPTS[language] ?? GOAL_PROMPTS.en;
  const targetCopy = TARGET_PROMPTS[language] ?? TARGET_PROMPTS.en;
  const cleanedDetails = details.trim();
  return [
    `Patient-declared goal: ${goalCopy[goal]}`,
    `Patient-declared target area: ${targetCopy[targetArea]}.`,
    cleanedDetails ? `Additional context: ${cleanedDetails}` : null,
  ].filter((line): line is string => line !== null).join('\n');
}
