// Stage 2 of the autoresearch loop: an LLM-driven proposer that takes a
// FrictionReport, the current sightmap content, the scenario task, and
// the run's score, and returns a structured list of proposed sightmap
// edits with rationales.

import Anthropic from '@anthropic-ai/sdk';
import type { FrictionReport } from './friction.js';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export interface ProposedEdit {
  /** Which sightmap file (path relative to repo) the edit applies to. */
  file: string;
  /** Kind of edit. The applier in Stage 3 will dispatch on this. */
  kind: 'add-component' | 'add-memory' | 'fix-selector' | 'add-component-memory' | 'other';
  /** A free-text rationale: WHY this edit is expected to help. Required. */
  rationale: string;
  /**
   * The actual YAML snippet to add or change. The proposer outputs this
   * verbatim; the applier takes care of merging it into the existing file.
   * For 'add-component', this is a single component object. For 'add-memory'
   * it's a string. For 'fix-selector' it's the new selector + the component
   * name to update.
   */
  payload: AddComponentPayload | AddMemoryPayload | FixSelectorPayload | AddComponentMemoryPayload | OtherPayload;
}

export interface AddComponentPayload {
  kind: 'add-component';
  /** Where to add. Either at top-level `components:` or under a specific view. */
  scope: 'global' | { kind: 'view'; viewName: string };
  /** The component definition as it should appear in YAML. */
  component: {
    name: string;
    selector: string | string[];
    description?: string;
    memory?: string[];
  };
}

export interface AddMemoryPayload {
  kind: 'add-memory';
  /** Where to attach. Top-level (file) memory, view-level memory, or comp-level. */
  scope: 'file' | { kind: 'view'; viewName: string };
  text: string;
}

export interface AddComponentMemoryPayload {
  kind: 'add-component-memory';
  componentName: string;
  text: string;
}

export interface FixSelectorPayload {
  kind: 'fix-selector';
  componentName: string;
  newSelector: string | string[];
}

export interface OtherPayload {
  kind: 'other';
  /** Free-form description for edits that don't fit the structured types. */
  description: string;
}

export interface ProposalResult {
  edits: ProposedEdit[];
  /** A short overall plan from the proposer — what is it trying to fix and why. */
  plan: string;
  /** Cost of this proposer call. */
  costUsd: number;
}

export interface ProposerInput {
  scenarioId: string;
  scenarioTask: string;
  score: number;
  turns: number;
  agentCostUsd: number;
  frictionReport: FrictionReport;
  /** Map of `file path → file contents` for the sightmap files in scope. */
  sightmapFiles: Record<string, string>;
  /** Model id for the proposer (default sonnet — friction reasoning benefits from it). */
  model?: string;
}

const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0, cacheRead: 0.1, cacheWrite: 1.25 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-opus-4-6': { input: 15.0, output: 75.0, cacheRead: 1.5, cacheWrite: 18.75 },
};

function resolveModel(shortName: string): string {
  const map: Record<string, string> = {
    haiku: 'claude-haiku-4-5-20251001',
    sonnet: 'claude-sonnet-4-6',
    opus: 'claude-opus-4-6',
  };
  return map[shortName] ?? shortName;
}

function priceCall(model: string, usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}): number {
  const p = PRICING_USD_PER_MTOK[model];
  if (!p) return 0;
  const inT = usage.input_tokens ?? 0;
  const outT = usage.output_tokens ?? 0;
  const crT = usage.cache_read_input_tokens ?? 0;
  const cwT = usage.cache_creation_input_tokens ?? 0;
  return (inT * p.input + outT * p.output + crT * p.cacheRead + cwT * p.cacheWrite) / 1_000_000;
}

const SYSTEM_PROMPT = `You are a sightmap-improvement assistant. A sightmap is a YAML schema that names UI components by stable selectors and attaches memory (notes about behavior, gotchas, hidden state) so an agent driving the page can act in semantic terms ("click AddToCartButton") instead of generic terms ("click ref e7").

You will be given:
1. A scenario the agent ran.
2. The agent's run metrics (score, turns, cost).
3. A friction report — observations about how the agent used (or didn't use) the sightmap.
4. The current sightmap files for the scenario's app.

Your job: propose specific edits to the sightmap that would have reduced friction. Edits should be small, additive, and high-confidence. Do NOT propose schema changes, refactors, or speculative restructuring. The goal is "next run uses fewer turns / fewer raw selectors / fewer browser_run_code_unsafe calls."

Output JSON ONLY in this shape:

{
  "plan": "<one paragraph: what you're trying to improve and why>",
  "edits": [
    {
      "file": "<path relative to repo root, matches a key in sightmapFiles>",
      "kind": "add-component" | "add-memory" | "add-component-memory" | "fix-selector" | "other",
      "rationale": "<one or two sentences: what friction signal you're addressing and why this edit will help>",
      "payload": <one of the payload shapes below>
    }
  ]
}

Payload shapes (match the kind exactly):

add-component:
  { "kind": "add-component",
    "scope": "global" | { "kind": "view", "viewName": "<name>" },
    "component": { "name": "<PascalCase>", "selector": "<css>" or ["<css>", ...], "description"?: "<text>", "memory"?: ["<note>", ...] } }

add-memory:
  { "kind": "add-memory",
    "scope": "file" | { "kind": "view", "viewName": "<name>" },
    "text": "<one-line note>" }

add-component-memory:
  { "kind": "add-component-memory", "componentName": "<existing component name>", "text": "<note>" }

fix-selector:
  { "kind": "fix-selector", "componentName": "<existing>", "newSelector": "<css>" or ["<css>", ...] }

other:
  { "kind": "other", "description": "<text>" }

Rules:
- Use existing component names from the sightmap when possible.
- Component names are PascalCase (CartButton, not cart-button).
- Selectors should be CSS, not Playwright role-syntax. Prefer test ids and stable class fragments over fragile structural paths.
- If the friction report shows raw selectors used 2+ times, those are strong promotion candidates.
- If the friction report shows sightmap_act errors with "component not found" for some name, propose adding that component.
- Do not propose any edit you can't ground in the friction report or the run's actual behavior.
- Cap edits at 8. If you have more candidates, pick the highest-confidence ones.
- Output ONLY the JSON object. No prose before or after.`;

export async function proposeEdits(input: ProposerInput): Promise<ProposalResult> {
  const modelShort = input.model ?? 'sonnet';
  const modelId = resolveModel(modelShort);

  const userMessage = buildUserMessage(input);

  const client = getClient();
  const response = await client.messages.create({
    model: modelId,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const parsed = parseProposerResponse(text);
  parsed.costUsd = priceCall(modelId, response.usage as unknown as {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  });
  return parsed;
}

export function buildUserMessage(input: ProposerInput): string {
  const lines: string[] = [];
  lines.push(`## Scenario: ${input.scenarioId}`);
  lines.push('');
  lines.push(input.scenarioTask);
  lines.push('');
  lines.push(`## Run metrics`);
  lines.push(`- Score: ${input.score.toFixed(2)} / 1.00`);
  lines.push(`- Turns: ${input.turns}`);
  lines.push(`- Agent cost: $${input.agentCostUsd.toFixed(2)}`);
  lines.push('');
  lines.push(`## Friction report`);
  const fr = input.frictionReport;
  lines.push(`- Total tool calls: ${fr.totalToolCalls}`);
  lines.push(`- Tool errors: ${fr.errorCount}`);
  lines.push(`- sightmap-aware ratio: ${(fr.ratios.sightmapAware * 100).toFixed(0)}%`);
  lines.push(`- run_code bypass ratio: ${(fr.ratios.runCodeBypass * 100).toFixed(0)}%`);
  lines.push(`- evaluate-inspection ratio: ${(fr.ratios.evaluateInspection * 100).toFixed(0)}%`);
  lines.push('');
  if (fr.successfulComponents.length > 0) {
    lines.push(`Components the agent used successfully (don't propose changes to these): ${fr.successfulComponents.join(', ')}`);
    lines.push('');
  }
  if (fr.rawSelectorUses.length > 0) {
    lines.push(`Raw selectors the agent reached for via the escape hatch:`);
    for (const s of fr.rawSelectorUses) lines.push(`  - ${s}`);
    lines.push('');
  }
  if (fr.sightmapToolErrors.length > 0) {
    lines.push(`Sightmap tool errors (each one is a signal about what the sightmap is missing):`);
    for (const e of fr.sightmapToolErrors) lines.push(`  - ${e.slice(0, 240)}`);
    lines.push('');
  }
  if (fr.signals.length > 0) {
    lines.push(`Detected signals:`);
    for (const s of fr.signals) lines.push(`  - [${s.kind}] ${s.message}`);
    lines.push('');
  }
  lines.push(`## Tool counts`);
  for (const tc of fr.toolCounts) lines.push(`  - ${tc.name}: ${tc.count}`);
  lines.push('');
  lines.push(`## Current sightmap files`);
  for (const [path, content] of Object.entries(input.sightmapFiles)) {
    lines.push(`### ${path}`);
    lines.push('```yaml');
    lines.push(content);
    lines.push('```');
    lines.push('');
  }
  lines.push(`## Output format reminder`);
  lines.push(`Output ONLY a JSON object with the shape described in the system prompt. No prose. No markdown fences around the JSON.`);
  return lines.join('\n');
}

export function parseProposerResponse(text: string): ProposalResult {
  // Strip markdown fences if the model wrapped in spite of instructions.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenceMatch ? fenceMatch[1] : text).trim();
  try {
    const parsed = JSON.parse(raw);
    const edits = Array.isArray(parsed.edits) ? parsed.edits.filter(isValidEdit) : [];
    return {
      plan: typeof parsed.plan === 'string' ? parsed.plan : '',
      edits,
      costUsd: 0,  // filled by caller
    };
  } catch {
    return { plan: '', edits: [], costUsd: 0 };
  }
}

function isValidEdit(e: unknown): e is ProposedEdit {
  if (typeof e !== 'object' || e === null) return false;
  const r = e as Record<string, unknown>;
  if (typeof r['file'] !== 'string') return false;
  if (typeof r['rationale'] !== 'string') return false;
  if (typeof r['kind'] !== 'string') return false;
  if (typeof r['payload'] !== 'object' || r['payload'] === null) return false;
  return true;
}
