import fs from 'fs';
import path from 'path';

/**
 * Extract YAML frontmatter from a skill file.
 * @param {string} filePath - Path to SKILL.md file
 * @returns {{name: string, description: string}}
 */
export function extractFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  let inFrontmatter = false;
  let name = '';
  let description = '';

  for (const line of lines) {
    if (line.trim() === '---') {
      if (inFrontmatter) break;
      inFrontmatter = true;
      continue;
    }
    if (!inFrontmatter) continue;

    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) name = nameMatch[1].trim();

    const descMatch = line.match(/^description:\s*(.+)$/);
    if (descMatch) description = descMatch[1].trim();
  }

  return { name, description };
}

/**
 * Walk a skills directory, returning [{ dir, name, description }] for each SKILL.md.
 * @param {string} skillsDir - Absolute path to skills/ root
 * @returns {Array<{dir: string, name: string, description: string}>}
 */
export function walkSkillsDir(skillsDir) {
  const out = [];
  if (!fs.existsSync(skillsDir)) return out;

  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const { name, description } = extractFrontmatter(skillFile);
    out.push({ dir: entry.name, name, description });
  }

  return out.sort((a, b) => a.dir.localeCompare(b.dir));
}
