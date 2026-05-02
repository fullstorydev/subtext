// LLM judge — scores a run by evaluating agent output against acceptance criteria.

import Anthropic from '@anthropic-ai/sdk';
import type { RunResult, Scenario } from './types.js';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

export interface JudgeResult {
  score: number;
  reasoning: string;
  criteria?: Array<{ criterion: string; passed: boolean; reason: string }>;
  costUsd: number;
}

/**
 * Anthropic API pricing in USD per million tokens, as of 2026-05.
 * Used to compute judge call cost from the SDK's usage field.
 */
const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  // Haiku 4.5
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0, cacheRead: 0.1, cacheWrite: 1.25 },
  // Sonnet 4.6
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  // Opus 4.6
  'claude-opus-4-6': { input: 15.0, output: 75.0, cacheRead: 1.5, cacheWrite: 18.75 },
};

export function computeJudgeCost(modelId: string, usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}): number {
  const p = PRICING_USD_PER_MTOK[modelId];
  if (!p) return 0;  // Unknown model — don't make up numbers.
  const inT = usage.input_tokens ?? 0;
  const outT = usage.output_tokens ?? 0;
  const crT = usage.cache_read_input_tokens ?? 0;
  const cwT = usage.cache_creation_input_tokens ?? 0;
  const cost =
    (inT * p.input + outT * p.output + crT * p.cacheRead + cwT * p.cacheWrite) / 1_000_000;
  return cost;
}

export async function judgeRun(
  result: RunResult,
  scenario: Scenario,
  agentOutput: string,
  judgeModel: string = 'haiku',
): Promise<JudgeResult> {
  const client = getClient();
  const modelId = resolveModel(judgeModel);

  // The raw agent log is stream-json with massive tool_result payloads.
  // Pre-digest into the signals that actually matter for judging: the
  // agent's final summary + a tool-call rollup + the tail of the log.
  // Falls back to head-truncation only if the digest is empty (malformed log).
  const maxOutputLen = 50_000;
  const digested = digestAgentOutput(agentOutput, maxOutputLen);
  const truncatedOutput = digested.length > 0
    ? digested
    : (agentOutput.length > maxOutputLen
        ? agentOutput.slice(-maxOutputLen) + '\n\n[...head truncated...]'
        : agentOutput);

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 2048,
    system: `You are an impartial QA judge. Score the agent's task completion from 0.0 to 1.0 based on the acceptance criteria. Be strict but fair. Return JSON only.`,
    messages: [{
      role: 'user',
      content: `## Task Description

${scenario.task}

## Acceptance Criteria

${scenario.acceptance_criteria}

## Agent Output

${truncatedOutput}

## Metrics

- Turns: ${result.turns}
- Errors: ${result.error_count}
- Wall time: ${result.wall_time_ms}ms

## Instructions

Score this run from 0.0 to 1.0. Return JSON:
{
  "score": <number>,
  "criteria": [
    {"criterion": "<text>", "passed": <boolean>, "reason": "<text>"}
  ],
  "reasoning": "<overall assessment>"
}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const parsed = parseJudgeResponse(text);
  // Attach the computed cost. The SDK returns usage on every message.
  parsed.costUsd = computeJudgeCost(modelId, response.usage as unknown as {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  });
  return parsed;
}

export function parseJudgeResponse(text: string): JudgeResult {
  // Try to extract JSON from the response (may be wrapped in markdown code fences)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
  const jsonStr = jsonMatch[1]?.trim() ?? text.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      score: typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : 0,
      reasoning: parsed.reasoning ?? '',
      criteria: parsed.criteria,
      costUsd: 0,
    };
  } catch {
    // If JSON parse fails, try to extract score from the text
    const scoreMatch = text.match(/"score"\s*:\s*([\d.]+)/);
    return {
      score: scoreMatch ? Math.max(0, Math.min(1, parseFloat(scoreMatch[1]))) : 0,
      reasoning: text,
      costUsd: 0,
    };
  }
}

/**
 * Distill the raw stream-json agent log into the signals that matter for
 * acceptance judging:
 *   - the agent's final text response (lives on the terminal `result` event
 *     OR the last `assistant` text block)
 *   - a tool-call summary: counts and any tools that errored
 *   - the tail of the assistant's narration (last few text blocks), which
 *     usually contains the per-step verification text
 *
 * Returns "" when no JSON events parse — caller falls back to head/tail
 * truncation of the raw text.
 */
export function digestAgentOutput(rawLog: string, maxLen: number): string {
  const lines = rawLog.split('\n').filter((l) => l.trim().length > 0);
  const toolCounts = new Map<string, number>();
  const erroredTools: string[] = [];
  const assistantTextBlocks: string[] = [];
  let finalResultText = '';
  let parsedAny = false;

  for (const line of lines) {
    let evt: unknown;
    try {
      evt = JSON.parse(line);
    } catch {
      continue;
    }
    parsedAny = true;
    const e = evt as Record<string, unknown>;
    const type = e['type'];

    if (type === 'assistant') {
      const msg = e['message'] as { content?: Array<Record<string, unknown>> } | undefined;
      const content = msg?.content ?? [];
      for (const block of content) {
        if (block['type'] === 'tool_use') {
          const name = String(block['name'] ?? 'unknown');
          toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
        } else if (block['type'] === 'text' && typeof block['text'] === 'string') {
          assistantTextBlocks.push(block['text']);
        }
      }
    }

    if (type === 'user') {
      const msg = e['message'] as { content?: Array<Record<string, unknown>> } | undefined;
      const content = msg?.content ?? [];
      for (const block of content) {
        if (block['type'] === 'tool_result' && block['is_error'] === true) {
          // We don't get the tool name on tool_result, but the count of
          // errors is signal enough for judging.
          erroredTools.push('error');
        }
      }
    }

    if (type === 'result' && typeof e['result'] === 'string') {
      finalResultText = e['result'] as string;
    }
  }

  if (!parsedAny) return '';

  const toolSummary = [...toolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `  - ${name}: ${count}`)
    .join('\n');

  const errorLine = erroredTools.length > 0
    ? `\nTool errors: ${erroredTools.length}`
    : '\nTool errors: 0';

  // Tail of assistant narration — this is where the per-step "Step N
  // complete" / verification text usually lives.
  const tailBlocks = assistantTextBlocks.slice(-12).join('\n\n---\n\n');

  const digest = [
    '## Agent final response',
    finalResultText.length > 0 ? finalResultText : '[no final result event captured]',
    '',
    '## Tool call summary',
    toolSummary.length > 0 ? toolSummary : '  (no tool calls)',
    errorLine,
    '',
    '## Recent agent narration (last text blocks)',
    tailBlocks.length > 0 ? tailBlocks : '[no assistant text blocks]',
  ].join('\n');

  if (digest.length <= maxLen) return digest;

  // Digest still too big — keep the final response in full, truncate the
  // narration tail.
  const headerSize = digest.indexOf('## Recent agent narration');
  const budget = Math.max(2000, maxLen - headerSize - 200);
  const truncatedTail = tailBlocks.slice(-budget);
  return [
    '## Agent final response',
    finalResultText.length > 0 ? finalResultText : '[no final result event captured]',
    '',
    '## Tool call summary',
    toolSummary.length > 0 ? toolSummary : '  (no tool calls)',
    errorLine,
    '',
    '## Recent agent narration (last text blocks, head truncated)',
    truncatedTail,
  ].join('\n');
}

function resolveModel(shortName: string): string {
  const models: Record<string, string> = {
    haiku: 'claude-haiku-4-5-20251001',
    sonnet: 'claude-sonnet-4-6',
    opus: 'claude-opus-4-6',
  };
  return models[shortName] ?? shortName;
}
