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
}

export async function judgeRun(
  result: RunResult,
  scenario: Scenario,
  agentOutput: string,
  judgeModel: string = 'haiku',
): Promise<JudgeResult> {
  const client = getClient();
  const modelId = resolveModel(judgeModel);

  // Truncate agent output if very long to stay within context
  const maxOutputLen = 50_000;
  const truncatedOutput = agentOutput.length > maxOutputLen
    ? agentOutput.slice(0, maxOutputLen) + '\n\n[...truncated...]'
    : agentOutput;

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
  return parseJudgeResponse(text);
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
    };
  } catch {
    // If JSON parse fails, try to extract score from the text
    const scoreMatch = text.match(/"score"\s*:\s*([\d.]+)/);
    return {
      score: scoreMatch ? Math.max(0, Math.min(1, parseFloat(scoreMatch[1]))) : 0,
      reasoning: text,
    };
  }
}

function resolveModel(shortName: string): string {
  const models: Record<string, string> = {
    haiku: 'claude-haiku-4-5-20251001',
    sonnet: 'claude-sonnet-4-6',
    opus: 'claude-opus-4-6',
  };
  return models[shortName] ?? shortName;
}
