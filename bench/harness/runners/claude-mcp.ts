// Claude MCP runner — launches claude CLI with an MCP config, captures output, extracts metrics.
// Handles subtext-local, subtext-bare, and playwright-mcp profiles.

import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Runner } from '../runner.js';
import type { Profile, Scenario, RunResult, BenchConfig, StepMetrics } from '../types.js';

const RESULTS_DIR = resolve(import.meta.dirname, '../../../results/runs');

export class ClaudeMcpRunner implements Runner {
  async run(scenario: Scenario, profile: Profile, config: BenchConfig): Promise<RunResult> {
    const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const specId = `${scenario.id}-${profile.id}`;
    const outDir = join(RESULTS_DIR, specId, runId);
    mkdirSync(outDir, { recursive: true });

    // Write MCP config to temp file
    const mcpConfigPath = join(outDir, 'mcp-config.json');
    writeFileSync(mcpConfigPath, profile.mcp_config ?? '{}');

    // Build the prompt
    const prompt = buildPrompt(scenario, profile, config);
    const promptPath = join(outDir, 'prompt.md');
    writeFileSync(promptPath, prompt);

    // Build system prompt
    const systemPrompt = [
      'You are a QA automation agent. Follow the task steps EXACTLY in order.',
      'Use the provided MCP tools for all browser interactions.',
      'Take snapshots after each major step to verify state.',
      'Do NOT skip steps or reorder them.',
      'Do NOT use evaluate_script to manipulate state directly — use click and fill only.',
      'Report your progress at each step.',
      '',
      profile.prompt_insert,
    ].join('\n');

    // Launch claude CLI
    const model = scenario.model ?? config.model;
    const agentLogPath = join(outDir, 'agent.log');
    const startTime = Date.now();

    const result = await new Promise<string>((resolvePromise, reject) => {
      const proc = spawn('claude', [
        '--print',
        '--model', model,
        '--mcp-config', mcpConfigPath,
        '--output-format', 'stream-json',
        '--system-prompt', systemPrompt,
        '--max-budget-usd', String(scenario.max_budget ?? config.max_budget),
      ], {
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Send the prompt via stdin
      proc.stdin.write(prompt);
      proc.stdin.end();

      let output = '';
      proc.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      let stderr = '';
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        writeFileSync(agentLogPath, output);
        if (stderr) {
          writeFileSync(join(outDir, 'agent.stderr.log'), stderr);
        }
        resolvePromise(output);
      });

      proc.on('error', reject);

      // Timeout
      const timeoutMs = parseTimeout(scenario.timeout ?? config.timeout);
      setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const wallTimeMs = Date.now() - startTime;

    // Parse metrics from stream-json output
    const metrics = parseClaudeOutput(result);

    // Get git SHA
    const gitSha = getGitSha();

    return {
      spec_id: specId,
      scenario_id: scenario.id,
      profile_id: profile.id,
      model,
      timestamp: new Date().toISOString(),
      git_sha: gitSha,
      score: 0,  // Filled by judge
      turns: metrics.turns,
      total_input_tokens: metrics.inputTokens,
      total_output_tokens: metrics.outputTokens,
      total_tokens: metrics.inputTokens + metrics.outputTokens,
      wall_time_ms: wallTimeMs,
      action_time_ms: metrics.actionTimeMs,
      llm_time_ms: metrics.llmTimeMs,
      error_count: metrics.errorCount,
      recovery_turns: metrics.recoveryTurns,
      steps: metrics.steps,
      judge_reasoning: '',  // Filled by judge
      agent_log_path: agentLogPath,
    };
  }
}

function buildPrompt(scenario: Scenario, profile: Profile, config: BenchConfig): string {
  const task = scenario.task.replace(/\{\{app_base_url\}\}/g, config.app_base_url);
  return [
    '## Task',
    '',
    task,
    '',
    '## Final Report',
    '',
    'When done, output:',
    '',
    '### Steps Completed',
    'List each step with what you observed.',
    '',
    '### Final State',
    'Describe the final state of the application.',
  ].join('\n');
}

export function parseClaudeOutput(output: string): {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  actionTimeMs: number;
  llmTimeMs: number;
  errorCount: number;
  recoveryTurns: number;
  steps: StepMetrics[];
} {
  // Parse stream-json lines
  const lines = output.split('\n').filter(l => l.trim());
  let turns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorCount = 0;
  const steps: StepMetrics[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'assistant') {
        turns++;
      }
      if (event.type === 'result') {
        inputTokens = event.input_tokens ?? 0;
        outputTokens = event.output_tokens ?? 0;
      }
      if (event.type === 'tool_result' && event.is_error) {
        errorCount++;
      }
    } catch {
      // Skip non-JSON lines
    }
  }

  return {
    turns,
    inputTokens,
    outputTokens,
    actionTimeMs: 0,  // TODO: extract from tool timing
    llmTimeMs: 0,     // TODO: extract from API timing
    errorCount,
    recoveryTurns: 0, // TODO: detect recovery patterns
    steps,
  };
}

export function parseTimeout(timeout: string): number {
  const match = timeout.match(/^(\d+)(s|m|h)$/);
  if (!match) return 600_000; // default 10 min
  const [, val, unit] = match;
  const ms = { s: 1000, m: 60_000, h: 3_600_000 }[unit!] ?? 60_000;
  return parseInt(val!) * ms;
}

function getGitSha(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}
