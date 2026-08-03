/**
 * ClaudeIntakeMapper — uses Claude claude-sonnet-4-6 with tool use + prompt caching
 * to map free-text requests to structured line selections.
 *
 * The LLM ONLY picks items and quantities from the KB.
 * ALL arithmetic happens in PricingEngine (never here).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { IntakeRequest, KnowledgeBase, MappedIntake } from '../domain/types.js';
import type { IntakeMapper } from './IntakeMapper.js';
import { MappedIntakeSchema } from '../domain/schemas.js';
import { validateMappedIntakeAgainstKB } from './validation.js';

const TOOL_NAME = 'select_quote_items';

/** Build a compact KB summary for the system prompt */
function buildKBSummary(kb: KnowledgeBase, language: string): string {
  const itemList = kb.items
    .map((item) => {
      const labelKey = language as 'it' | 'sq' | 'en';
      const name = item.name[labelKey] ?? item.name.en;
      return `  - id: "${item.id}", name: "${name}", unitPrice: ${item.unitPrice} ${kb.currency}/${item.unit}, category: ${item.category}`;
    })
    .join('\n');

  const modList = kb.modifiers
    .map((m) => {
      const labelKey = language as 'it' | 'sq' | 'en';
      const label = m.label[labelKey] ?? m.label.en;
      return `  - id: "${m.id}", label: "${label}", type: ${m.type}, value: ${m.value}`;
    })
    .join('\n');

  return `CLIENT: ${kb.clientName} (${kb.clientId})
CURRENCY: ${kb.currency}
LANGUAGE: ${language}

AVAILABLE ITEMS (ONLY pick from this list — do NOT invent IDs):
${itemList}

AVAILABLE MODIFIERS (optional — only include if clearly applicable):
${modList}`;
}

/** Tool definition for structured output */
function buildTool(): Anthropic.Tool {
  return {
    name: TOOL_NAME,
    description:
      'Select items and quantities from the knowledge base to fulfill the customer request. ' +
      'Do NOT invent item IDs. Do NOT do any arithmetic. Only pick items that match the request.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lines: {
          type: 'array',
          description: 'Line items to include in the quote',
          items: {
            type: 'object',
            properties: {
              itemId: {
                type: 'string',
                description: 'The exact item ID from the knowledge base',
              },
              quantity: {
                type: 'number',
                description: 'How many units of this item',
                minimum: 0.1,
              },
              modifierIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Modifier IDs to apply to this line (optional)',
              },
            },
            required: ['itemId', 'quantity'],
          },
          minItems: 1,
        },
        quoteModifierIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Modifier IDs to apply at quote level (optional)',
        },
        notes: {
          type: 'string',
          description: 'Brief note about the mapping (optional)',
        },
      },
      required: ['lines', 'quoteModifierIds'],
    },
  };
}

/**
 * Structural view of an Anthropic message: just enough to locate the tool
 * call. Keeps the parse/validate core pure and testable without the SDK.
 */
export interface IntakeToolResponse {
  readonly content: ReadonlyArray<{ readonly type: string; readonly input?: unknown }>;
  readonly stop_reason: string | null;
}

/**
 * Parse and validate the model's tool response into a MappedIntake.
 * Throws on missing tool call, schema-invalid output, or invented item IDs;
 * unknown modifier IDs are dropped with a warning (soft failure).
 */
export function parseIntakeToolResponse(
  response: IntakeToolResponse,
  kb: KnowledgeBase,
): MappedIntake {
  const toolUseBlock = response.content.find((block) => block.type === 'tool_use');

  if (!toolUseBlock) {
    throw new Error(
      `ClaudeIntakeMapper: model did not call the ${TOOL_NAME} tool. ` +
        `Stop reason: ${response.stop_reason}`,
    );
  }

  const parseResult = MappedIntakeSchema.safeParse(toolUseBlock.input);
  if (!parseResult.success) {
    const issues = parseResult.error.errors.map((e) => e.message).join('; ');
    throw new Error(`ClaudeIntakeMapper: invalid tool output schema: ${issues}`);
  }

  const validationResult = validateMappedIntakeAgainstKB(
    parseResult.data as MappedIntake,
    kb,
  );

  if (!validationResult.ok) {
    throw new Error(
      `ClaudeIntakeMapper: model output failed KB validation: ${validationResult.error}`,
    );
  }

  return validationResult.intake;
}

export class ClaudeIntakeMapper implements IntakeMapper {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async map(request: IntakeRequest, kb: KnowledgeBase): Promise<MappedIntake> {
    const kbSummary = buildKBSummary(kb, request.language);

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text:
            `You are a quoting assistant. Your ONLY job is to map customer requests to items from the knowledge base. ` +
            `You MUST NOT do arithmetic. You MUST NOT invent item IDs. ` +
            `Only use IDs exactly as they appear in the knowledge base below.\n\n` +
            kbSummary,
          // Prompt caching on the KB/system block (stable content)
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [buildTool()],
      tool_choice: { type: 'any' },
      messages: [
        {
          role: 'user',
          content: `Customer request: "${request.freeText}"\n\nPlease select the appropriate items and quantities.`,
        },
      ],
    });

    return parseIntakeToolResponse(response, kb);
  }
}
