/**
 * IntakeMapper interface.
 * Implementations: ClaudeIntakeMapper (real) and MockIntakeMapper (offline/test).
 */
import type { IntakeRequest, KnowledgeBase, MappedIntake } from '../domain/types.js';

export interface IntakeMapper {
  /**
   * Map a free-text intake request to structured line selections.
   * Must validate output against the KB — must not invent items.
   */
  map(request: IntakeRequest, kb: KnowledgeBase): Promise<MappedIntake>;
}
