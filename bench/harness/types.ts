// Core types for the benchmark harness

export interface BenchConfig {
  model: string;           // Claude model for all profiles (e.g., "sonnet")
  judge_model: string;     // Model for LLM judge (e.g., "haiku")
  timeout: string;         // Default timeout per scenario (e.g., "10m")
  max_budget: number;      // Max USD per scenario run
  app_port: number;        // Port for Potemkin dev server
  app_base_url: string;    // Base URL for test apps
}

export interface Profile {
  id: string;              // e.g., "subtext-local"
  runner: string;          // e.g., "claude-mcp", "stagehand", "agent-browser"
  mcp_config?: string;     // JSON MCP config for claude-mcp runner
  command?: string;        // CLI command for agent-browser runner
  prompt_insert: string;   // Profile-specific instructions for the agent
  sightmap_files?: string[]; // Paths to .sightmap/ YAML files
  tags: string[];          // e.g., ["baseline"], ["mcp", "subtext"]
}

export interface Scenario {
  id: string;              // e.g., "todo-001"
  description: string;
  app: string;             // e.g., "todo", "topwork", "medcart"
  tags: string[];          // e.g., ["workflow", "trained"]
  model?: string;          // Override default model
  timeout?: string;        // Override default timeout
  max_budget?: number;     // Override default budget
  task: string;            // Task prompt for the agent
  acceptance_criteria: string; // What the judge evaluates against
  profiles: string[];      // Which profiles to run
}

export interface Suite {
  id: string;
  description: string;
  scenarios: string[];     // Scenario IDs
}

export interface StepMetrics {
  turn: number;
  tool: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  success: boolean;
  error?: string;
}

export interface RunResult {
  spec_id: string;         // "{scenario_id}-{profile_id}"
  scenario_id: string;
  profile_id: string;
  model: string;
  timestamp: string;       // ISO 8601
  git_sha: string;
  score: number;           // 0.0 - 1.0
  turns: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  wall_time_ms: number;
  action_time_ms: number;
  llm_time_ms: number;
  error_count: number;
  recovery_turns: number;
  steps: StepMetrics[];
  judge_reasoning: string;
  agent_log_path: string;
  screenshot_path?: string;
}

export interface ComparisonRow {
  scenario_id: string;
  profile_id: string;
  score: number;
  turns: number;
  total_tokens: number;
  wall_time_ms: number;
  efficiency: number;      // score / (total_tokens / 1000)
}

export interface Comparison {
  suite_id: string;
  timestamp: string;
  rows: ComparisonRow[];
  baseline?: ComparisonRow[];  // Previous baseline for delta
}
