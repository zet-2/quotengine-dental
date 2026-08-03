/**
 * ClaudeDentalVisionMapper — uses Claude (claude-sonnet-4-6, multimodal + tool use)
 * to produce a NON-DIAGNOSTIC DentalAssessment from patient images + free text.
 *
 * The model ONLY extracts coarse signals and picks treatment item IDs from the KB.
 * ALL pricing happens later in the deterministic PricingEngine. The model's output
 * is zod- + KB-validated before it is trusted; treatments not in the KB are rejected.
 *
 * Requires ANTHROPIC_API_KEY (provided via env). Verified live, not in offline tests —
 * the pure parser (parseDentalAssessmentToolInput) carries the unit-tested logic.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { IntakeRequest, KnowledgeBase, IntakeImage } from '../domain/types.js';
import type { DentalAssessment } from './types.js';
import type { DentalVisionMapper } from './DentalVisionMapper.js';
import { isAutoQuoteableItem, MAX_AUTO_QUOTE_CANDIDATES } from './autoQuotePolicy.js';
import { DentalAssessmentSchema } from './schemas.js';
import { validateAssessmentAgainstKB } from './validation.js';

const TOOL_NAME = 'record_dental_assessment';

/**
 * Parse + validate the model's tool output. Pure and exported for testing.
 * Throws on schema-invalid output or on treatments not present in the KB.
 */
export function parseDentalAssessmentToolInput(
  rawInput: unknown,
  kb: KnowledgeBase,
): DentalAssessment {
  const parsed = DentalAssessmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.errors.map((e) => e.message).join('; ');
    throw new Error(`ClaudeDentalVisionMapper: invalid tool output schema: ${issues}`);
  }

  const result = validateAssessmentAgainstKB(parsed.data as DentalAssessment, kb);
  if (!result.ok) {
    throw new Error(
      `ClaudeDentalVisionMapper: model output failed KB validation: ${result.error}`,
    );
  }

  return result.assessment;
}

/** Compact list of KB items the model may pick treatment IDs from */
function buildKBTreatmentSummary(kb: KnowledgeBase, language: string): string {
  const key = language as 'it' | 'sq' | 'en';
  return kb.items
    .filter(isAutoQuoteableItem)
    .map((item) => {
      const name = item.name[key] ?? item.name.en;
      const group = item.exclusiveGroup ? `, alternativeGroup: ${item.exclusiveGroup}` : '';
      return `  - id: "${item.id}", name: "${name}", category: ${item.category}${group}`;
    })
    .join('\n');
}

export function buildSystemPrompt(kb: KnowledgeBase, language: string): string {
  return (
    `You are a dental treatment-estimation assistant for ${kb.clientName}. ` +
    `You look at patient-submitted intraoral photos and/or a panoramic x-ray plus their message, ` +
    `and produce a COARSE, CONSERVATIVE, NON-DIAGNOSTIC assessment to support an INDICATIVE price estimate.\n\n` +
    `STRICT RULES:\n` +
    `- You are NOT diagnosing. Note only clearly-visible signals (e.g. obviously missing teeth, edentulous spans).\n` +
    `- Only select treatment item IDs that appear in the list below. NEVER invent IDs.\n` +
    `- Items sharing an alternativeGroup are mutually exclusive commercial variants. Select at most ONE item ID from each such group; if the material/system cannot be chosen from the evidence, return no candidate treatment for that group.\n` +
    `- The list intentionally excludes diagnostic and other non-treatment items; never infer them from an image.\n` +
    `- Be conservative: if the images are poor quality or you are unsure, set imageQuality / overallConfidence ` +
    `accordingly and return FEWER or NO candidateTreatments rather than guessing.\n` +
    `- Always set requiresClinicalConfirmation to true.\n` +
    `- FIRST catalog only clearly artificial EXISTING restorations you can see (implants, crowns, bridges, posts, dentures) in the existingRestorations field. Natural teeth and edentulous spans are not restorations; never record them as "other". If uncertain, omit the restoration.\n` +
    `- candidateTreatments must be NEW work ONLY: do NOT propose an implant where a fixture already exists, and do NOT re-crown an existing crown. Account for existing restorations before proposing quantities.\n` +
    `- Every candidateTreatment MUST identify exactly one arch (upper or lower); never omit arch.\n` +
    `- Implant COUNT must be CONSERVATIVE: propose the FEWEST implants that address the chief complaint — roughly one implant per clearly missing tooth that needs replacing, NOT one per gap or space. When unsure, choose the LOWER number.\n` +
    `- Full-arch implant solutions (All-on-4/6 or any 4+ implant proposal) are NOT supported by the current commercial catalog. Return no candidate treatment for full-arch work rather than pricing only its implant fixtures.\n` +
    `- Teeth that are PRESENT (even worn, broken, or root-treated) should be restored with CROWNS — do NOT propose extracting and implanting a tooth that can be crowned. Prefer crowns/bridges over implants wherever a tooth or span can be restored conventionally.\n` +
    `- Do NOT do any arithmetic or pricing.\n` +
    `- Write observation, rationale, and notes text in the patient's requested language (${language}).\n\n` +
    `AVAILABLE ITEMS (pick treatment IDs ONLY from here):\n` +
    buildKBTreatmentSummary(kb, language)
  );
}

export function buildTool(): Anthropic.Tool {
  return {
    name: TOOL_NAME,
    description:
      'Record a coarse, non-diagnostic dental assessment: arch findings + candidate treatments ' +
      '(item IDs from the KB only), image quality, confidence, and a clinical-confirmation flag. No pricing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        archFindings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              arch: { type: 'string', enum: ['upper', 'lower'] },
              observation: { type: 'string' },
              confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
            required: ['arch', 'observation', 'confidence'],
          },
        },
        candidateTreatments: {
          type: 'array',
          maxItems: MAX_AUTO_QUOTE_CANDIDATES,
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string', description: 'Exact item ID from the knowledge base' },
              quantity: { type: 'integer', minimum: 1, maximum: 32 },
              arch: { type: 'string', enum: ['upper', 'lower'] },
              rationale: { type: 'string' },
              needsConfirmation: { type: 'boolean' },
            },
            required: ['itemId', 'quantity', 'arch', 'rationale', 'needsConfirmation'],
          },
        },
        existingRestorations: {
          type: 'array',
          description:
            'Restorations ALREADY present (implants/crowns/bridges/posts/dentures) — NOT to be treated again.',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['implant', 'crown', 'bridge', 'post', 'denture', 'other'],
              },
              arch: { type: 'string', enum: ['upper', 'lower'] },
              count: { type: 'integer', minimum: 1, maximum: 32 },
              note: { type: 'string' },
            },
            required: ['type', 'count'],
          },
        },
        imageQuality: { type: 'string', enum: ['good', 'fair', 'poor'] },
        overallConfidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        requiresClinicalConfirmation: { type: 'boolean' },
        notes: { type: 'string' },
      },
      required: [
        'archFindings',
        'candidateTreatments',
        'imageQuality',
        'overallConfidence',
        'requiresClinicalConfirmation',
      ],
    },
  };
}

export function buildImageBlocks(images: readonly IntakeImage[]): Anthropic.ImageBlockParam[] {
  return images.map((img) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: img.mediaType,
      data: img.data,
    },
  }));
}

export class ClaudeDentalVisionMapper implements DentalVisionMapper {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model = 'claude-sonnet-4-6') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async assess(request: IntakeRequest, kb: KnowledgeBase): Promise<DentalAssessment> {
    const textBlock: Anthropic.TextBlockParam = {
      type: 'text',
      text:
        `Patient message: "${request.freeText}"\n\n` +
        `Assess the attached image(s) and record a coarse, non-diagnostic assessment. ` +
        `Pick treatment item IDs ONLY from the knowledge base.`,
    };

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: 1024,
        system: [
          {
            type: 'text',
            text: buildSystemPrompt(kb, request.language),
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [buildTool()],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [
          {
            role: 'user',
            content: [textBlock, ...buildImageBlocks(request.images ?? [])],
          },
        ],
      },
      {
        // Keep the lead funnel bounded and prevent transparent SDK retries from
        // multiplying a vision charge. The saved lead falls back to clinic follow-up.
        timeout: 45_000,
        maxRetries: 0,
      },
    );

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUse) {
      throw new Error(
        `ClaudeDentalVisionMapper: model did not call the ${TOOL_NAME} tool. ` +
          `Stop reason: ${response.stop_reason}`,
      );
    }

    return parseDentalAssessmentToolInput(toolUse.input, kb);
  }
}
