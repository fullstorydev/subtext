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

// Repo root = parent of bench/. Profiles can use `{{REPO_ROOT}}` in their
// mcp_config string to reference paths inside the repo (e.g. for sightmap
// dirs under bench/apps/) without hard-coding absolute paths.
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');

export function applyTemplate(text: string, vars: Record<string, string>): string {
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}

export class ClaudeMcpRunner implements Runner {
  async run(scenario: Scenario, profile: Profile, config: BenchConfig): Promise<RunResult> {
    const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const specId = `${scenario.id}-${profile.id}`;
    const outDir = join(RESULTS_DIR, specId, runId);
    mkdirSync(outDir, { recursive: true });

    // Write MCP config to temp file. Profiles may template `{{REPO_ROOT}}`
    // and `{{app_base_url}}` inside their mcp_config string; expand those
    // before writing so the spawned MCP server gets real paths/URLs.
    const mcpConfigPath = join(outDir, 'mcp-config.json');
    const mcpConfigText = applyTemplate(profile.mcp_config ?? '{}', {
      REPO_ROOT,
      app_base_url: config.app_base_url,
    });
    writeFileSync(mcpConfigPath, mcpConfigText);

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

    let timedOut = false;
    const result = await new Promise<string>((resolvePromise, reject) => {
      const proc = spawn('claude', [
        '--print',
        '--model', model,
        '--mcp-config', mcpConfigPath,
        '--output-format', 'stream-json',
        // --output-format stream-json now requires --verbose under --print
        // (claude CLI ≥ 2.1). The parser ignores non-JSON lines, so this
        // doesn't affect metric extraction.
        '--verbose',
        // Bench isolation: --bare strips the host's hooks, plugins, skills,
        // CLAUDE.md auto-discovery, and auto-memory so the spawned agent
        // doesn't inherit the developer's local Claude Code session
        // (Subtext, Notion, etc.). --strict-mcp-config makes sure ONLY the
        // profile's MCP servers are available. Without these, scores are
        // contaminated by whatever's installed on the host.
        '--bare',
        '--strict-mcp-config',
        // Non-interactive permission flow: in --print mode the user can't
        // approve permission prompts, so the agent gets stuck on the first
        // MCP tool call. The bench runs in a controlled sandbox against
        // local apps; skipping permission prompts is appropriate here.
        '--dangerously-skip-permissions',
        // Restrict the agent to MCP tools only. Without this the agent has
        // access to Bash/Read/Edit/Write and we observed it editing the
        // bench-app source files during scenarios — contaminating the test
        // and biasing results. The bench is a benchmark of browser-driving
        // tools; the agent should drive the browser, not the codebase.
        '--allowedTools', 'mcp__*',
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

      let settled = false;

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          writeFileSync(agentLogPath, output);
          if (stderr) {
            writeFileSync(join(outDir, 'agent.stderr.log'), stderr);
          }
          resolvePromise(output);
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      // Timeout. On timeout we DON'T reject — we kill the subprocess,
      // flush the partial output to disk, and resolve with what we
      // captured. The orchestrator can still call the judge (which will
      // typically score 0 because the task didn't complete) and we
      // preserve cost + tool-distribution signal that would otherwise
      // be lost. The result carries `timed_out: true` for downstream.
      const timeoutMs = parseTimeout(scenario.timeout ?? config.timeout);
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          timedOut = true;
          proc.kill('SIGTERM');
          // Give the kernel a moment to flush stdout before we read it.
          setTimeout(() => {
            writeFileSync(agentLogPath, output);
            const stderrSummary = stderr
              ? stderr + `\n\n[bench] Timed out after ${timeoutMs}ms; agent process killed.\n`
              : `[bench] Timed out after ${timeoutMs}ms; agent process killed.\n`;
            writeFileSync(join(outDir, 'agent.stderr.log'), stderrSummary);
            resolvePromise(output);
          }, 250);
        }
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
      agent_cost_usd: metrics.costUsd,
      judge_cost_usd: 0,  // Filled by judge
      timed_out: timedOut,
      judge_reasoning: '',  // Filled by judge
      agent_log_path: agentLogPath,
    };
  }
}

export function buildPrompt(scenario: Scenario, profile: Profile, config: BenchConfig): string {
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
  cacheReadTokens: number;
  cacheCreationTokens: number;
  actionTimeMs: number;
  llmTimeMs: number;
  errorCount: number;
  recoveryTurns: number;
  steps: StepMetrics[];
  costUsd: number;
} {
  // Parse stream-json lines
  const lines = output.split('\n').filter(l => l.trim());
  let turns = 0;
  // Sum token usage across every assistant turn. The terminal `result` event
  // sometimes reports the LAST turn's input_tokens (not the session total),
  // which under-reports drastically on cache-heavy runs (we saw 108 tokens
  // for a 91-turn run that actually cost $0.55). Per-turn summation gives
  // the true session totals.
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let errorCount = 0;
  let costUsd = 0;
  const steps: StepMetrics[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'assistant') {
        turns++;
        const usage = event.message?.usage;
        if (usage) {
          inputTokens += usage.input_tokens ?? 0;
          outputTokens += usage.output_tokens ?? 0;
          cacheReadTokens += usage.cache_read_input_tokens ?? 0;
          cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
        }
      }
      if (event.type === 'result') {
        // total_cost_usd is the agent's cumulative spend across the
        // session (includes cache reads/writes, model calls). Trust it
        // verbatim — Claude CLI computes it.
        if (typeof event.total_cost_usd === 'number') {
          costUsd = event.total_cost_usd;
        }
        // Fallback path for older stream-json schemas where assistant
        // events didn't carry usage. Only use the result event's counts
        // when we got nothing from the per-turn pass.
        if (inputTokens === 0 && outputTokens === 0) {
          inputTokens = event.usage?.input_tokens ?? event.input_tokens ?? 0;
          outputTokens = event.usage?.output_tokens ?? event.output_tokens ?? 0;
          cacheReadTokens = event.usage?.cache_read_input_tokens ?? 0;
          cacheCreationTokens = event.usage?.cache_creation_input_tokens ?? 0;
        }
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
    cacheReadTokens,
    cacheCreationTokens,
    actionTimeMs: 0,  // TODO: extract from tool timing
    llmTimeMs: 0,     // TODO: extract from API timing
    errorCount,
    recoveryTurns: 0, // TODO: detect recovery patterns
    steps,
    costUsd,
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
