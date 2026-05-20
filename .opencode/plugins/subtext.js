/**
 * Subtext plugin for OpenCode.ai
 *
 * Injects Subtext bootstrap context into the first user message of each
 * session and registers `skills/` so OpenCode's native `skill` tool can
 * discover Subtext skills (subtext:live, subtext:proof, subtext:tunnel, …).
 *
 * Adapted from superpowers (https://github.com/obra/superpowers).
 * Copyright (c) 2025 Jesse Vincent. Licensed under MIT. See NOTICE.md.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple frontmatter extraction (avoid dependency on skills-core for bootstrap).
const extractAndStripFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content };
  return { frontmatter: {}, content: match[2] };
};

// Module-level cache for bootstrap content. The SKILL.md file does not change
// during a session, so reading + parsing it once eliminates redundant disk
// work on every agent step.
let _bootstrapCache = undefined; // undefined = not yet loaded, null = file missing

export const SubtextPlugin = async ({ client, directory }) => {
  const subtextSkillsDir = path.resolve(__dirname, '../../skills');

  // Helper to generate bootstrap content (cached after first call).
  const getBootstrapContent = () => {
    if (_bootstrapCache !== undefined) return _bootstrapCache;

    const skillPath = path.join(subtextSkillsDir, 'using-subtext', 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      _bootstrapCache = null;
      return null;
    }

    const fullContent = fs.readFileSync(skillPath, 'utf8');
    const { content } = extractAndStripFrontmatter(fullContent);

    const toolMapping = `**Tool Mapping for OpenCode:**
When skills reference tools you don't have, substitute OpenCode equivalents:
- \`TodoWrite\` → \`todowrite\`
- \`Task\` tool with subagents → Use OpenCode's subagent system (@mention)
- \`Skill\` tool → OpenCode's native \`skill\` tool
- \`Read\`, \`Write\`, \`Edit\`, \`Bash\` → Your native tools

Use OpenCode's native \`skill\` tool to load Subtext skills by name (e.g.
\`subtext/live\`, \`subtext/proof\`, \`subtext/tunnel\`).\n\n`;

    _bootstrapCache = `<SUBTEXT_BOOTSTRAP>\nThis session has the Subtext plugin available. The skill below explains what tools you have and when to use them. After reading it, use the \`skill\` tool to invoke any specific Subtext skill by name.\n\n${toolMapping}${content}\n</SUBTEXT_BOOTSTRAP>`;
    return _bootstrapCache;
  };

  return {
    // Best-effort: register the skills/ dir so OpenCode's `skill` tool can
    // discover Subtext skills. Currently a no-op due to upstream OpenCode bug
    // — each service gets a scoped config copy, so this mutation is invisible
    // to Skill.all(). Kept in place so it starts working once the upstream
    // issue is fixed; until then users add skills.paths to opencode.json
    // manually (see .opencode/INSTALL.md).
    // Tracking: https://github.com/sst/opencode/issues/20940
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(subtextSkillsDir)) {
        config.skills.paths.push(subtextSkillsDir);
      }
    },

    // Inject bootstrap into the first user message of each session.
    //
    // Using a user message instead of a system message avoids:
    //   1. Token bloat from system messages repeated every turn
    //   2. Multiple system messages breaking models that disallow them
    //
    // The hook fires on every agent step (not just every turn) because
    // OpenCode's prompt.ts reloads messages from DB each step. Fresh message
    // arrays may need injection again, so getBootstrapContent() must not do
    // repeated disk work.
    'experimental.chat.messages.transform': async (_input, output) => {
      const bootstrap = getBootstrapContent();
      if (!bootstrap || !output.messages.length) return;
      const firstUser = output.messages.find(m => m.info.role === 'user');
      if (!firstUser || !firstUser.parts.length) return;

      // Guard: skip if first user message already contains bootstrap. This
      // prevents double injection when OpenCode passes an already transformed
      // in-memory message array through the hook again.
      if (firstUser.parts.some(p => p.type === 'text' && p.text.includes('SUBTEXT_BOOTSTRAP'))) return;

      const firstTextPart = firstUser.parts.find(p => p.type === 'text');
      if (firstTextPart) {
        firstTextPart.text = `${bootstrap}\n\n${firstTextPart.text}`;
      } else {
        firstUser.parts.unshift({ type: 'text', text: bootstrap });
      }
    },
  };
};
