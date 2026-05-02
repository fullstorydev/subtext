// Friction analysis — read an agent run log and infer signals about where
// the sightmap could be improved.
//
// Stage 1 of the autoresearch loop. Pure function over a stream-json log;
// no LLM, no I/O beyond reading the log content the caller hands us.

export interface ToolUseRecord {
  /** Name of the tool the agent invoked (e.g., 'mcp__sightmap__sightmap_act'). */
  name: string;
  /** Arguments the agent passed. May contain strings/numbers/objects. */
  input: Record<string, unknown>;
  /** Tool-use id from the stream-json event, used to correlate with tool_result. */
  id: string;
}

export interface FrictionReport {
  /** Total tool_use blocks in assistant messages. */
  totalToolCalls: number;
  /** Counts by tool name, sorted descending. */
  toolCounts: Array<{ name: string; count: number }>;
  /** Tool calls whose result came back with is_error: true. */
  errorCount: number;

  /**
   * Behavior ratios — useful for cross-run comparison and for the edit
   * proposer's reasoning. All are in [0, 1].
   */
  ratios: {
    /** sightmap_*  /  total. High = agent is using the sightmap surface. */
    sightmapAware: number;
    /** browser_run_code_unsafe / total. High = agent is bypassing the surface. */
    runCodeBypass: number;
    /** browser_evaluate / total. High = agent inspecting via JS. */
    evaluateInspection: number;
  };

  /**
   * Specific friction signals worth flagging to the edit proposer. Each is
   * a hint at what kind of sightmap edit might reduce friction in the next
   * run. Hints, not commands — the LLM still has to decide.
   */
  signals: FrictionSignal[];

  /**
   * Components the agent successfully acted on with `sightmap_act` during
   * this run. Not friction per se — useful context for the proposer ("don't
   * propose adding these; they're working").
   */
  successfulComponents: string[];

  /**
   * Selectors the agent passed to `sightmap_act` via the raw `selector`
   * escape hatch. Each is a candidate for promotion into a named component
   * if the same selector appears repeatedly.
   */
  rawSelectorUses: string[];

  /**
   * Errors emitted by sightmap_* tools — typically "component not found",
   * "no instance contains text X", "selector matched nothing." Each is a
   * direct signal about what the sightmap is missing.
   */
  sightmapToolErrors: string[];
}

export type FrictionSignal =
  | {
      kind: 'high-bypass';
      /** Fraction of tool calls that bypassed the sightmap surface. */
      ratio: number;
      message: string;
    }
  | {
      kind: 'low-sightmap-adoption';
      ratio: number;
      message: string;
    }
  | {
      kind: 'repeated-snapshot';
      /** Number of sightmap_snapshot or browser_snapshot calls. Ideal: 1-2 per view. */
      count: number;
      message: string;
    }
  | {
      kind: 'sightmap-act-failures';
      count: number;
      message: string;
    }
  | {
      kind: 'raw-selector-promotion-candidate';
      selector: string;
      uses: number;
      message: string;
    };

/**
 * Walk a stream-json log and extract tool-use records along with errors.
 * Tolerant of malformed lines (skips them).
 */
export function extractToolUseRecords(rawLog: string): {
  toolCalls: ToolUseRecord[];
  errorCount: number;
  toolErrorTexts: Array<{ tool?: string; text: string }>;
  /** Tool-use ids whose result came back with is_error: true. */
  erroredIds: Set<string>;
} {
  const lines = rawLog.split('\n').filter((l) => l.trim().length > 0);
  const toolCalls: ToolUseRecord[] = [];
  let errorCount = 0;
  const toolErrorTexts: Array<{ tool?: string; text: string }> = [];
  const erroredIds = new Set<string>();

  // Walk events to correlate tool_use with its later tool_result.
  // We key by tool_use_id which appears on both blocks.
  const idToToolName = new Map<string, string>();

  for (const line of lines) {
    let evt: unknown;
    try {
      evt = JSON.parse(line);
    } catch {
      continue;
    }
    const e = evt as Record<string, unknown>;
    const type = e['type'];

    if (type === 'assistant') {
      const msg = e['message'] as { content?: Array<Record<string, unknown>> } | undefined;
      const content = msg?.content ?? [];
      for (const block of content) {
        if (block['type'] === 'tool_use') {
          const name = String(block['name'] ?? 'unknown');
          const id = String(block['id'] ?? '');
          const input = (block['input'] as Record<string, unknown>) ?? {};
          toolCalls.push({ name, input, id });
          if (id.length > 0) idToToolName.set(id, name);
        }
      }
    }

    if (type === 'user') {
      const msg = e['message'] as { content?: Array<Record<string, unknown>> } | undefined;
      const content = msg?.content ?? [];
      for (const block of content) {
        if (block['type'] === 'tool_result' && block['is_error'] === true) {
          errorCount++;
          const id = String(block['tool_use_id'] ?? '');
          if (id.length > 0) erroredIds.add(id);
          const tool = idToToolName.get(id);
          let text = '';
          const c = block['content'];
          if (typeof c === 'string') text = c;
          else if (Array.isArray(c)) {
            text = c
              .map((b) => (typeof b === 'object' && b !== null ? String((b as Record<string, unknown>)['text'] ?? '') : ''))
              .join(' ');
          }
          toolErrorTexts.push({ tool, text: text.slice(0, 500) });
        }
      }
    }
  }

  return { toolCalls, errorCount, toolErrorTexts, erroredIds };
}

/**
 * Run friction analysis on a stream-json log. Doesn't talk to an LLM — it
 * just counts and pattern-matches. Output is a typed report consumable by
 * the edit proposer (Stage 2) or directly by a human reviewer.
 */
export function analyzeFriction(rawLog: string): FrictionReport {
  const { toolCalls, errorCount, toolErrorTexts, erroredIds } = extractToolUseRecords(rawLog);

  const counts = new Map<string, number>();
  for (const t of toolCalls) counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
  const total = toolCalls.length;

  const sightmapStarred = sumWherePrefix(counts, 'mcp__sightmap__sightmap_');
  const runCode = countOf(counts, 'mcp__sightmap__browser_run_code_unsafe') +
                  countOf(counts, 'mcp__playwright__browser_run_code_unsafe');
  const evaluateCount = countOf(counts, 'mcp__sightmap__browser_evaluate') +
                        countOf(counts, 'mcp__playwright__browser_evaluate');
  const snapshotCount = countOf(counts, 'mcp__sightmap__sightmap_snapshot') +
                        countOf(counts, 'mcp__sightmap__browser_snapshot') +
                        countOf(counts, 'mcp__playwright__browser_snapshot');

  const ratios = {
    sightmapAware: total > 0 ? sightmapStarred / total : 0,
    runCodeBypass: total > 0 ? runCode / total : 0,
    evaluateInspection: total > 0 ? evaluateCount / total : 0,
  };

  // Pull out sightmap_act argument patterns. Only count components/selectors
  // whose tool_result did NOT come back as an error — the proposer should
  // know what's working so it doesn't propose changes there.
  const successfulComponents = new Set<string>();
  const rawSelectorUseCount = new Map<string, number>();
  for (const t of toolCalls) {
    if (t.name === 'mcp__sightmap__sightmap_act' && !erroredIds.has(t.id)) {
      const c = typeof t.input['componentName'] === 'string' && t.input['componentName'].length > 0
        ? t.input['componentName']
        : null;
      const s = typeof t.input['selector'] === 'string' && t.input['selector'].length > 0
        ? t.input['selector']
        : null;
      if (c !== null) successfulComponents.add(c);
      if (s !== null) rawSelectorUseCount.set(s, (rawSelectorUseCount.get(s) ?? 0) + 1);
    }
  }

  const sightmapToolErrors = toolErrorTexts
    .filter((e) => e.tool?.startsWith('mcp__sightmap__sightmap_'))
    .map((e) => `${e.tool}: ${e.text}`)
    .slice(0, 10);

  // Synthesize signals.
  const signals: FrictionSignal[] = [];
  if (total >= 5 && ratios.sightmapAware < 0.15) {
    signals.push({
      kind: 'low-sightmap-adoption',
      ratio: ratios.sightmapAware,
      message: `Agent used sightmap_* tools on ${(ratios.sightmapAware * 100).toFixed(0)}% of calls — most actions went through the generic browser_* surface. The sightmap may be missing components for the actions the agent kept performing.`,
    });
  }
  if (total >= 5 && ratios.runCodeBypass > 0.2) {
    signals.push({
      kind: 'high-bypass',
      ratio: ratios.runCodeBypass,
      message: `Agent fell back to browser_run_code_unsafe on ${(ratios.runCodeBypass * 100).toFixed(0)}% of calls. This is usually because no sightmap component fits the target — candidates for new components or memory entries.`,
    });
  }
  if (snapshotCount >= 5) {
    signals.push({
      kind: 'repeated-snapshot',
      count: snapshotCount,
      message: `Agent called snapshot tools ${snapshotCount} times. If many of these are on the same view, the snapshot output may be missing information the agent kept needing — candidate for view-level memory.`,
    });
  }
  const sightmapActErrors = toolErrorTexts.filter((e) => e.tool === 'mcp__sightmap__sightmap_act').length;
  if (sightmapActErrors >= 2) {
    signals.push({
      kind: 'sightmap-act-failures',
      count: sightmapActErrors,
      message: `sightmap_act returned errors ${sightmapActErrors} times — selectors may be stale, ambiguous, or the named component may not actually be on the page when the agent reaches it.`,
    });
  }
  for (const [selector, uses] of rawSelectorUseCount) {
    if (uses >= 2) {
      signals.push({
        kind: 'raw-selector-promotion-candidate',
        selector,
        uses,
        message: `Agent passed raw selector "${selector}" to sightmap_act ${uses} times. If this is a recurring target, promote it to a named component in the sightmap so future runs can use semantic naming.`,
      });
    }
  }

  return {
    totalToolCalls: total,
    toolCounts: Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    errorCount,
    ratios,
    signals,
    successfulComponents: Array.from(successfulComponents).sort(),
    rawSelectorUses: Array.from(rawSelectorUseCount.keys()).sort(),
    sightmapToolErrors,
  };
}

function countOf(counts: Map<string, number>, key: string): number {
  return counts.get(key) ?? 0;
}

function sumWherePrefix(counts: Map<string, number>, prefix: string): number {
  let total = 0;
  for (const [k, v] of counts) if (k.startsWith(prefix)) total += v;
  return total;
}
