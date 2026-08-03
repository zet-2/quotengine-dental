/**
 * Reproducibility identifiers persisted with every lead.
 *
 * Bump PROMPT_VERSION when the system/user prompt changes, TOOL_SCHEMA_VERSION
 * when the structured model contract changes, KB_VERSION when dental items or
 * prices change, and PIPELINE_VERSION for orchestration/safety-gate changes.
 */
export const DENTAL_PIPELINE_VERSION = '2.3.0';
export const DENTAL_PROMPT_VERSION = '2026-07-13.direct-estimate-v4-required-arch';
export const DENTAL_TOOL_SCHEMA_VERSION = '3';
export const DENTAL_KB_VERSION = '2026-07-13';
