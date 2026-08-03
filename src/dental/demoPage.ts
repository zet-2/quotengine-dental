import type { Language } from '../domain/types.js';
import type { PatientDentalResult } from './patientResult.js';
import {
  buildPatientIntentText,
  isPatientTargetArea,
  isPatientTreatmentGoal,
  PATIENT_TREATMENT_GOALS,
  type PatientTargetArea,
  type PatientTreatmentGoal,
} from './patientIntent.js';

export const DEMO_GOALS = PATIENT_TREATMENT_GOALS;
export type DemoGoal = PatientTreatmentGoal;
export const isDemoTargetArea = isPatientTargetArea;

interface LocalizedCopy {
  readonly resultTitle: string;
  readonly resultEyebrow: string;
  readonly estimateReady: string;
  readonly consultationTitle: string;
  readonly consultationBody: string;
  readonly retryHint: string;
  readonly commercialTitle: string;
  readonly commercialRange: string;
  readonly demoExplanation: string;
  readonly commercialInclusionsLabel: string;
  readonly commercialAssumptionsLabel: string;
  readonly commercialExclusionsLabel: string;
  readonly selectedArea: string;
  readonly targetArea: Record<PatientTargetArea, string>;
  readonly perArchReference: string;
  readonly newEstimate: string;
  readonly estimatedRange: string;
  readonly indicativeTotal: string;
  readonly breakdown: string;
  readonly centralBreakdown: string;
  readonly treatment: string;
  readonly quantity: string;
  readonly amount: string;
  readonly labor: string;
  readonly fees: string;
  readonly markup: string;
  readonly tax: string;
  readonly calculatedTotal: string;
  readonly disclaimer: string;
  readonly noPriceDisclaimer: string;
}

const COPY: Record<Language, LocalizedCopy> = {
  it: {
    resultTitle: 'La tua stima',
    resultEyebrow: 'Quotengine · risultato automatico',
    estimateReady: 'Stima automatica disponibile',
    consultationTitle: 'Stima non disponibile',
    consultationBody: 'Le informazioni disponibili non sono sufficienti per produrre una stima entro i limiti configurati.',
    retryHint: 'Se possiedi un piano di trattamento scritto, aggiungilo ai dettagli del prossimo tentativo.',
    commercialTitle: 'Scenario full-arch dimostrativo',
    commercialRange: 'Fascia demo',
    demoExplanation: 'Questa fascia usa valori sintetici esclusivamente dimostrativi. Non rappresenta prezzi di mercato né il listino di una clinica e non determina l’idoneità al trattamento.',
    commercialInclusionsLabel: 'Compreso nella fascia',
    commercialAssumptionsLabel: 'Ipotesi della fascia',
    commercialExclusionsLabel: 'Non incluso',
    selectedArea: 'Area selezionata',
    targetArea: { upper: 'arcata superiore', lower: 'arcata inferiore', both: 'entrambe le arcate' },
    perArchReference: 'Riferimento per arcata',
    newEstimate: 'Nuovo preventivo',
    estimatedRange: 'Fascia indicativa',
    indicativeTotal: 'Totale indicativo',
    breakdown: 'Dettaglio della stima',
    centralBreakdown: 'Dettaglio dello scenario centrale; la fascia considera la variazione nel numero di impianti.',
    treatment: 'Trattamento',
    quantity: 'Quantità',
    amount: 'Importo',
    labor: 'Prestazioni cliniche',
    fees: 'Costi fissi',
    markup: 'Maggiorazione',
    tax: 'IVA',
    calculatedTotal: 'Totale scenario centrale',
    disclaimer: 'Preventivo puramente indicativo e non vincolante. Non è una diagnosi. Da confermare in consulenza clinica con il dentista.',
    noPriceDisclaimer: 'Nessun prezzo è stato generato. Questa risposta non è una diagnosi; il percorso va definito in consulenza clinica.',
  },
  en: {
    resultTitle: 'Your estimate',
    resultEyebrow: 'Quotengine · automatic result',
    estimateReady: 'Automatic estimate available',
    consultationTitle: 'Estimate unavailable',
    consultationBody: 'The available information is insufficient to produce an estimate within the configured safety limits.',
    retryHint: 'If you have a written treatment plan, add it to the details on the next attempt.',
    commercialTitle: 'Full-arch demonstration scenario',
    commercialRange: 'Demo range',
    demoExplanation: 'This range uses synthetic values for demonstration only. It is not a market reference or a clinic price list and does not determine treatment eligibility.',
    commercialInclusionsLabel: 'Included in the range',
    commercialAssumptionsLabel: 'Range assumptions',
    commercialExclusionsLabel: 'Not included',
    selectedArea: 'Selected area',
    targetArea: { upper: 'upper arch', lower: 'lower arch', both: 'both arches' },
    perArchReference: 'Per-arch reference',
    newEstimate: 'New estimate',
    estimatedRange: 'Indicative range',
    indicativeTotal: 'Indicative total',
    breakdown: 'Estimate breakdown',
    centralBreakdown: 'Central-scenario breakdown; the range allows for variation in implant count.',
    treatment: 'Treatment',
    quantity: 'Quantity',
    amount: 'Amount',
    labor: 'Clinical services',
    fees: 'Fixed fees',
    markup: 'Markup',
    tax: 'Tax',
    calculatedTotal: 'Central-scenario total',
    disclaimer: 'Purely indicative, non-binding estimate. This is not a diagnosis. To be confirmed in a clinical consultation with the dentist.',
    noPriceDisclaimer: 'No price was generated. This response is not a diagnosis; the treatment path must be defined in a clinical consultation.',
  },
  sq: {
    resultTitle: 'Vlerësimi yt',
    resultEyebrow: 'Quotengine · rezultat automatik',
    estimateReady: 'Vlerësimi automatik është gati',
    consultationTitle: 'Vlerësimi nuk është i disponueshëm',
    consultationBody: 'Informacioni i disponueshëm nuk mjafton për të prodhuar një vlerësim brenda kufijve të konfiguruar të sigurisë.',
    retryHint: 'Nëse ke një plan trajtimi të shkruar, shtoje te detajet në përpjekjen tjetër.',
    commercialTitle: 'Skenar demonstrues full-arch',
    commercialRange: 'Interval demonstrues',
    demoExplanation: 'Ky interval përdor vlera sintetike vetëm për demonstrim. Nuk është referencë tregu ose listë çmimesh e një klinike dhe nuk përcakton përshtatshmërinë për trajtim.',
    commercialInclusionsLabel: 'Përfshihet në interval',
    commercialAssumptionsLabel: 'Supozimet e intervalit',
    commercialExclusionsLabel: 'Nuk përfshihet',
    selectedArea: 'Zona e zgjedhur',
    targetArea: { upper: 'harku i sipërm', lower: 'harku i poshtëm', both: 'të dy harqet' },
    perArchReference: 'Referenca për hark',
    newEstimate: 'Vlerësim i ri',
    estimatedRange: 'Interval orientues',
    indicativeTotal: 'Totali orientues',
    breakdown: 'Detajet e vlerësimit',
    centralBreakdown: 'Detajet e skenarit qendror; intervali merr parasysh ndryshimin në numrin e implanteve.',
    treatment: 'Trajtimi',
    quantity: 'Sasia',
    amount: 'Shuma',
    labor: 'Shërbime klinike',
    fees: 'Kosto fikse',
    markup: 'Shtesa',
    tax: 'TVSH',
    calculatedTotal: 'Totali i skenarit qendror',
    disclaimer: 'Ofertë thjesht orientuese dhe jo-detyruese. Nuk është diagnozë. Të konfirmohet në një konsultë klinike me dentistin.',
    noPriceDisclaimer: 'Nuk u gjenerua asnjë çmim. Kjo përgjigje nuk është diagnozë; rruga e trajtimit duhet përcaktuar në konsultë klinike.',
  },
};

const STYLES = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#F2EFE9;color:#1D2A2A;font-family:"Avenir Next","Century Gothic",sans-serif;font-weight:400}
main{position:relative;width:min(720px,calc(100% - 32px));margin:64px auto 80px}
.sheet{position:relative;background:#FBF8F2;border:1px solid #C9C2B8;border-radius:2px;padding:clamp(28px,6vw,64px)}
.registration{position:absolute;left:-25px;top:72px;width:50px;color:#C86448;font-family:"Iowan Old Style",Georgia,serif;font-size:42px;line-height:1;text-align:center}
.registration::after{content:"";display:block;width:50px;height:1px;margin-top:9px;background:#C86448}
.eyebrow{margin:0 0 14px;color:#176B66;font-size:12px;letter-spacing:.14em;text-transform:uppercase}
h1{max-width:590px;margin:0;font-family:"Iowan Old Style",Georgia,serif;font-size:clamp(38px,8vw,66px);font-weight:400;line-height:.98;letter-spacing:-.035em}
.lede{max-width:560px;margin:28px 0 0;font-size:18px;line-height:1.6}
form{display:grid;min-width:0;gap:24px;margin-top:42px}
.field{display:grid;min-width:0;gap:8px}
label{font-size:14px;letter-spacing:.02em}
input,textarea,select{width:100%;min-width:0;max-width:100%;border:1px solid #C9C2B8;border-radius:2px;background:#F2EFE9;color:#1D2A2A;font:inherit;font-weight:400;padding:13px 14px}
input:focus,textarea:focus,select:focus{outline:2px solid #176B66;outline-offset:2px}
textarea{min-height:112px;resize:vertical}
button,.action{display:inline-block;width:max-content;border:1px solid #176B66;border-radius:2px;background:#176B66;color:#FBF8F2;font:inherit;font-weight:400;padding:13px 20px;text-decoration:none;cursor:pointer}
button:hover,.action:hover{background:#125550}
.note{margin:36px 0 0;border-top:1px solid #C9C2B8;padding-top:18px;color:#5D6663;font-size:13px;line-height:1.55}
.result-card{margin-top:40px;border-left:3px solid #176B66;padding:4px 0 4px 24px}
.result-card.caution{border-left-color:#C86448}
.result-card h2{margin:0 0 12px;font-family:"Iowan Old Style",Georgia,serif;font-size:30px;font-weight:400}
.result-card p{margin:10px 0;line-height:1.6}
.amount{margin:22px 0 6px;font-family:"Iowan Old Style",Georgia,serif;font-size:clamp(36px,7vw,58px);line-height:1}
.amount-label{color:#5D6663;font-size:13px;letter-spacing:.08em;text-transform:uppercase}
.detail-label{color:#176B66;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.exclusions{border-top:1px solid #C9C2B8;padding-top:14px;color:#5D6663;font-size:13px}
.terms{margin:8px 0 0;padding-left:20px;color:#5D6663;font-size:13px;line-height:1.55}
.terms-note{margin-top:14px;color:#5D6663;font-size:13px}
.breakdown{width:100%;margin:30px 0 0;border-collapse:collapse;border:1px solid #C9C2B8;background:#F2EFE9;font-size:13px;line-height:1.45}
.breakdown caption{padding:0 0 10px;text-align:left;color:#5D6663;letter-spacing:.04em}
.breakdown th,.breakdown td{border-bottom:1px solid #C9C2B8;padding:11px 12px;text-align:left;font-weight:400}
.breakdown th{color:#5D6663;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.breakdown th:nth-child(2),.breakdown td:nth-child(2){text-align:center}
.breakdown th:last-child,.breakdown td:last-child{text-align:right}
.breakdown tr.total td{border-top:2px solid #176B66;color:#176B66;font-size:14px}
.disclaimer{margin:32px 0 0;border-top:1px solid #C9C2B8;padding-top:18px;color:#5D6663;font-size:13px;line-height:1.55}
.actions{margin-top:32px}
@media(max-width:560px){main{margin-top:28px}.sheet{padding:28px 22px}.registration{left:-12px;top:40px;font-size:30px;width:32px}.registration::after{width:32px}}
`;

function esc(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]!);
}

export function isDemoGoal(value: unknown): value is DemoGoal {
  return isPatientTreatmentGoal(value);
}

export function buildDemoIntakeText(
  goal: DemoGoal,
  details: string,
  language: Language,
  targetArea: PatientTargetArea = 'both',
): string {
  return buildPatientIntentText(goal, targetArea, details, language);
}

export function renderDemoForm(): string {
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Preventivo dentale indicativo</title><style>${STYLES}</style></head><body><main>
<section class="sheet"><div class="registration" aria-hidden="true">01</div>
<p class="eyebrow">Quotengine · demo locale · interfaccia italiana</p>
<h1>Una stima orientativa, prima della visita.</h1>
<p class="lede">Indica il tuo obiettivo e, se previsto dalla demo, aggiungi una panoramica anonimizzata. Il risultato è orientativo: non formula diagnosi, non stabilisce l’idoneità e non sostituisce la visita.</p>
<form method="post" action="/dental-quote" enctype="multipart/form-data">
  <div class="field"><label for="goal">Cosa vorresti ottenere?</label>
  <select id="goal" name="goal" required><option value="" selected disabled>Seleziona un obiettivo</option>
    <option value="replace_few_teeth">Sostituire da uno a tre denti mancanti</option>
    <option value="restore_teeth">Restaurare denti usurati o danneggiati</option>
    <option value="improve_smile">Migliorare il sorriso</option>
    <option value="fixed_full_arch">Una soluzione fissa per un’intera arcata</option>
    <option value="existing_plan">Ho già un piano di trattamento</option>
    <option value="unsure">Non so ancora quale soluzione scegliere</option>
  </select></div>
  <div class="field"><label for="targetArea">Quale area vuoi stimare?</label>
  <select id="targetArea" name="targetArea" required><option value="" selected disabled>Seleziona l’area</option>
    <option value="upper">Arcata superiore</option><option value="lower">Arcata inferiore</option><option value="both">Entrambe le arcate</option>
  </select></div>
  <div class="field"><label for="image">Radiografia panoramica <span id="imageRequirement">(richiesta salvo scenario full-arch)</span></label><input id="image" type="file" name="image" accept="image/jpeg,image/png,image/webp" required></div>
  <div class="field"><label for="text">Dettagli utili o piano già ricevuto</label><textarea id="text" name="text" placeholder="Per esempio: mi interessa l’arcata superiore; il mio dentista ha proposto due impianti…"></textarea></div>
  <div class="field"><label for="lang">Lingua del risultato</label><select id="lang" name="lang"><option value="it">Italiano</option><option value="en">English</option><option value="sq">Shqip</option></select></div>
  <button type="submit">Genera la stima demo</button>
</form>
<p class="note">Usa soltanto immagini sintetiche o anonimizzate in questa demo. Una radiografia non determina da sola diagnosi, idoneità implantare o piano definitivo.</p>
</section></main><script>
const goal=document.getElementById('goal');const image=document.getElementById('image');const hint=document.getElementById('imageRequirement');
function syncImageRequirement(){const optional=goal.value==='fixed_full_arch';image.required=!optional;hint.textContent=optional?'(facoltativa: non viene usata per calcolare questa fascia)':'(richiesta)'}
goal.addEventListener('change',syncImageRequirement);syncImageRequirement();
</script></body></html>`;
}

function formatMoney(value: number, currency: string, language: Language): string {
  const locale = language === 'it' ? 'it-IT' : language === 'sq' ? 'sq-AL' : 'en-GB';
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(value);
}

export function renderDemoResult(
  result: PatientDentalResult,
  language: Language,
): string {
  const copy = COPY[language] ?? COPY.en;
  const commercial = result.commercialEstimate;
  const currency = commercial?.currency ?? result.quote?.currency ?? 'EUR';
  const amount = commercial
    ? `${formatMoney(commercial.totalRange.low, currency, language)} – ${formatMoney(commercial.totalRange.high, currency, language)}`
    : result.priceRange
    ? `${formatMoney(result.priceRange.totalRange.low, currency, language)} – ${formatMoney(result.priceRange.totalRange.high, currency, language)}`
    : result.quote ? formatMoney(result.quote.total, currency, language) : null;
  const amountLabel = commercial
    ? copy.commercialRange
    : result.priceRange ? copy.estimatedRange : copy.indicativeTotal;
  const lineRows = (result.quote?.lineItems ?? [])
    .map((line) => `<tr><td>${esc(line.label)}</td><td>${line.quantity}</td><td>${esc(formatMoney(line.lineTotal, currency, language))}</td></tr>`)
    .join('');
  const quote = result.quote;
  const adjustmentRows = quote
    ? [
        quote.labor > 0 ? `<tr><td>${esc(copy.labor)}</td><td>—</td><td>${esc(formatMoney(quote.labor, currency, language))}</td></tr>` : '',
        quote.fees > 0 ? `<tr><td>${esc(copy.fees)}</td><td>—</td><td>${esc(formatMoney(quote.fees, currency, language))}</td></tr>` : '',
        ...quote.modifiersApplied.map((modifier) => `<tr><td>${esc(modifier.label)}</td><td>—</td><td>${esc(formatMoney(modifier.amount, currency, language))}</td></tr>`),
        quote.markup > 0 ? `<tr><td>${esc(copy.markup)}</td><td>—</td><td>${esc(formatMoney(quote.markup, currency, language))}</td></tr>` : '',
        quote.tax > 0 ? `<tr><td>${esc(copy.tax)}</td><td>—</td><td>${esc(formatMoney(quote.tax, currency, language))}</td></tr>` : '',
        `<tr class="total"><td>${esc(copy.calculatedTotal)}</td><td>—</td><td>${esc(formatMoney(quote.total, currency, language))}</td></tr>`,
      ].join('')
    : '';
  const breakdownCaption = result.priceRange ? copy.centralBreakdown : copy.breakdown;
  const scopeDetail = result.targetArea
    ? `<p><span class="detail-label">${esc(copy.selectedArea)}</span> · ${esc(copy.targetArea[result.targetArea])}</p>`
    : '';
  const breakdown = lineRows
    ? `<table class="breakdown"><caption>${esc(breakdownCaption)}</caption><thead><tr><th scope="col">${esc(copy.treatment)}</th><th scope="col">${esc(copy.quantity)}</th><th scope="col">${esc(copy.amount)}</th></tr></thead><tbody>${lineRows}${adjustmentRows}</tbody></table>`
    : '';
  const commercialDetail = commercial
    ? `<section class="result-card"><h2>${esc(copy.commercialTitle)}</h2><p class="amount-label">${esc(amountLabel)}</p><p class="amount">${esc(amount!)}</p><p><span class="detail-label">${esc(copy.selectedArea)}</span> · ${esc(copy.targetArea[commercial.targetArea])}</p><p><span class="detail-label">${esc(copy.perArchReference)}</span> · ${esc(formatMoney(commercial.unitRange.low, currency, language))} – ${esc(formatMoney(commercial.unitRange.high, currency, language))}</p><p>${esc(copy.demoExplanation)}</p><p class="detail-label">${esc(copy.commercialInclusionsLabel)}</p><ul class="terms">${commercial.terms.inclusions.map((item) => `<li>${esc(item)}</li>`).join('')}</ul><p class="detail-label">${esc(copy.commercialAssumptionsLabel)}</p><ul class="terms">${commercial.terms.assumptions.map((item) => `<li>${esc(item)}</li>`).join('')}</ul><p class="detail-label exclusions">${esc(copy.commercialExclusionsLabel)}</p><ul class="terms">${commercial.terms.exclusions.map((item) => `<li>${esc(item)}</li>`).join('')}</ul><p class="terms-note">${esc(commercial.terms.tax.note)}</p><p class="terms-note">${esc(commercial.terms.validity.note)}</p></section>`
    : null;
  const main = result.consultationOnly
    ? `<section class="result-card caution"><h2>${esc(copy.consultationTitle)}</h2><p>${esc(copy.consultationBody)}</p><p>${esc(copy.retryHint)}</p></section>`
    : commercialDetail ?? `<section class="result-card"><h2>${esc(copy.estimateReady)}</h2>${amount ? `<p class="amount-label">${esc(amountLabel)}</p><p class="amount">${esc(amount)}</p>` : ''}${scopeDetail}${breakdown}</section>`;

  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(copy.resultTitle)}</title><style>${STYLES}</style></head><body><main>
<section class="sheet"><div class="registration" aria-hidden="true">02</div>
<p class="eyebrow">${esc(copy.resultEyebrow)}</p><h1>${esc(copy.resultTitle)}</h1>
${main}
<p class="disclaimer">⚠ ${esc(result.consultationOnly ? copy.noPriceDisclaimer : result.disclaimer)}</p>
<div class="actions"><a class="action" href="/">${esc(copy.newEstimate)}</a></div>
</section></main></body></html>`;
}
