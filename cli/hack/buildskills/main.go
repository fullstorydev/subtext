// buildskills generates skills/ (MCP) and cli/skills/ (CLI) from templates/skills/.
// Run via: go generate ./... from the cli/ directory.
package main

import (
	"bytes"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
	"text/template"
)

// toolNamespaces is the allowlist for {{tool "name"}} references.
var toolNamespaces = []string{
	"live", "comment", "doc", "tunnel", "review", "privacy", "sightmap", "artifact", "auth",
}

func main() {
	// Paths are relative to cli/, where go generate runs.
	templatesDir := filepath.Join("..", "templates", "skills")
	targetDirs := map[string]string{
		"mcp": filepath.Join("..", "skills"),
		"cli": "skills",
	}

	entries, err := os.ReadDir(templatesDir)
	if err != nil {
		fatal("read templates dir: %v", err)
	}

	// Track which skill dirs we write per target, to clean up stale ones.
	written := map[string][]string{"mcp": nil, "cli": nil}

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		skillName := e.Name()
		skillDir := filepath.Join(templatesDir, skillName)

		skillFile := filepath.Join(skillDir, "SKILL.template")
		if _, err := os.Stat(skillFile); os.IsNotExist(err) {
			continue // skip dirs without a SKILL.template
		}
		fm, body, err := readSkill(skillFile)
		if err != nil {
			fatal("skill %s: %v", skillName, err)
		}

		skillTargets := fm.targets
		if len(skillTargets) == 0 {
			skillTargets = []string{"mcp", "cli"}
		}

		for _, target := range skillTargets {
			outDir, ok := targetDirs[target]
			if !ok {
				fatal("skill %s: unknown target %q", skillName, target)
			}
			outSkillDir := filepath.Join(outDir, skillName)

			// Use SKILL.<target>.md body if present.
			bodyToRender := body
			overrideFile := filepath.Join(skillDir, "SKILL."+target+".template")
			if data, err := os.ReadFile(overrideFile); err == nil {
				bodyToRender = string(data)
			}

			rendered, err := renderTemplate(bodyToRender, skillName, target)
			if err != nil {
				fatal("skill %s target %s: render: %v", skillName, target, err)
			}

			outFM := fm.forTarget(target)
			content := "---\n" + outFM + "---\n" + rendered

			if err := os.MkdirAll(outSkillDir, 0o755); err != nil {
				fatal("mkdir %s: %v", outSkillDir, err)
			}
			if err := os.WriteFile(filepath.Join(outSkillDir, "SKILL.md"), []byte(content), 0o644); err != nil {
				fatal("write skill %s/%s: %v", target, skillName, err)
			}

			// Copy sibling files (non-SKILL*.md).
			if err := copySiblings(skillDir, outSkillDir, target); err != nil {
				fatal("copy siblings %s/%s: %v", target, skillName, err)
			}

			written[target] = append(written[target], skillName)
		}
	}

	// Remove stale output dirs no longer present in templates.
	for target, outDir := range targetDirs {
		existingDirs, _ := readDirNames(outDir)
		for _, d := range existingDirs {
			if d == "embed.go" {
				continue
			}
			if !slices.Contains(written[target], d) {
				if err := os.RemoveAll(filepath.Join(outDir, d)); err != nil {
					fatal("remove stale %s/%s: %v", target, d, err)
				}
			}
		}
	}

	// Write cli/skills/embed.go listing the CLI skill directories.
	if err := writeEmbedFile("skills", written["cli"]); err != nil {
		fatal("write embed.go: %v", err)
	}

	fmt.Printf("buildskills: wrote %d MCP skills, %d CLI skills\n",
		len(written["mcp"]), len(written["cli"]))
}

// skill holds parsed SKILL.md data.
type skill struct {
	rawFrontmatter string // original YAML between the --- delimiters
	name           string // extracted from name: field
	targets        []string
}

// targetsRe matches "  targets: [mcp, cli]" or "  targets: [mcp]" etc.
var targetsRe = regexp.MustCompile(`(?m)^\s*targets:\s*\[([^\]]*)\]`)

// nameRe matches "name: foo" in frontmatter.
var nameRe = regexp.MustCompile(`(?m)^name:\s*(\S+)`)

// readSkill reads SKILL.md and splits into skill struct and body string.
func readSkill(path string) (*skill, string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, "", err
	}
	content := string(data)
	parts := strings.SplitN(content, "---", 3)
	if len(parts) < 3 {
		return nil, "", fmt.Errorf("missing frontmatter delimiters in %s", path)
	}
	fmRaw := parts[1]

	// Extract name.
	nm := nameRe.FindStringSubmatch(fmRaw)
	if nm == nil {
		return nil, "", fmt.Errorf("frontmatter missing name field in %s", path)
	}

	// Extract targets.
	var targets []string
	if tm := targetsRe.FindStringSubmatch(fmRaw); tm != nil {
		for _, t := range strings.Split(tm[1], ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				targets = append(targets, t)
			}
		}
	}

	return &skill{
		rawFrontmatter: fmRaw,
		name:           nm[1],
		targets:        targets,
	}, parts[2], nil
}

// forTarget returns the frontmatter YAML string for the output file.
// It strips the `targets:` line and injects `_generated_from:`.
func (s *skill) forTarget(target string) string {
	lines := strings.Split(s.rawFrontmatter, "\n")
	var out []string
	inMetadata := false
	metadataIndent := ""
	generatedFromInserted := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Skip the targets line.
		if targetsRe.MatchString(line) {
			continue
		}

		// Detect "metadata:" block.
		if strings.HasPrefix(trimmed, "metadata:") {
			inMetadata = true
			metadataIndent = strings.Repeat(" ", len(line)-len(strings.TrimLeft(line, " ")))
			out = append(out, line)
			// Inject _generated_from as first child.
			out = append(out, metadataIndent+"  _generated_from: templates/skills/"+s.name+"/SKILL.template")
			generatedFromInserted = true
			continue
		}

		// Once in metadata, check if we've left it (dedent or new top-level key).
		if inMetadata && trimmed != "" && !strings.HasPrefix(line, metadataIndent+" ") {
			inMetadata = false
		}

		out = append(out, line)
	}

	if !generatedFromInserted {
		// No metadata block exists — add one.
		// Insert before the closing blank line / end.
		out = append(out, "metadata:")
		out = append(out, "  _generated_from: templates/skills/"+s.name+"/SKILL.template")
	}

	return strings.Join(out, "\n")
}

// renderTemplate processes the skill body through text/template.
func renderTemplate(body, skillName, target string) (string, error) {
	funcs := template.FuncMap{
		"tool": func(name string) (string, error) {
			return expandTool(name, target)
		},
		"cli": func(s string) string {
			if target == "cli" {
				return s
			}
			return ""
		},
		"mcp": func(s string) string {
			if target == "mcp" {
				return s
			}
			return ""
		},
	}
	data := struct{ Target string }{Target: target}
	tmpl, err := template.New(skillName).Funcs(funcs).Parse(body)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// expandTool converts a tool name to its display form for the given target.
// MCP: `tool-name`
// CLI: `subtext ns rest-of-name` (split on first hyphen)
func expandTool(name, target string) (string, error) {
	parts := strings.SplitN(name, "-", 2)
	ns := parts[0]
	if !slices.Contains(toolNamespaces, ns) {
		return "", fmt.Errorf("tool %q: unknown namespace %q (allowed: %v)", name, ns, toolNamespaces)
	}
	if target == "cli" {
		if len(parts) == 2 {
			return "`subtext " + ns + " " + parts[1] + "`", nil
		}
		return "`subtext " + ns + "`", nil
	}
	return "`" + name + "`", nil
}

// copySiblings copies non-SKILL*.md sibling files to the output dir.
// Files in _<target>/ are copied to outDir (stripping the _<target>/ prefix).
// Other siblings (Python scripts, testdata, etc.) go to MCP output only.
func copySiblings(srcDir, outDir, target string) error {
	entries, err := os.ReadDir(srcDir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, "SKILL") && (strings.HasSuffix(name, ".md") || strings.HasSuffix(name, ".template")) {
			continue
		}

		srcPath := filepath.Join(srcDir, name)

		// _mcp/ and _cli/ subdirs are target-specific.
		if e.IsDir() && name == "_"+target {
			if err := copyDir(srcPath, outDir); err != nil {
				return fmt.Errorf("copy _%s/: %w", target, err)
			}
			continue
		}
		if e.IsDir() && strings.HasPrefix(name, "_") {
			continue // skip the other target's dir
		}

		// All other siblings are MCP-only by default.
		if target != "mcp" {
			continue
		}
		if e.IsDir() {
			if err := copyDir(srcPath, filepath.Join(outDir, name)); err != nil {
				return err
			}
		} else {
			if err := copyFile(srcPath, filepath.Join(outDir, name)); err != nil {
				return err
			}
		}
	}
	return nil
}

func copyDir(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		dstPath := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(dstPath, 0o755)
		}
		return copyFile(path, dstPath)
	})
}

func copyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func readDirNames(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names, nil
}

// writeEmbedFile writes cli/skills/embed.go with a //go:embed directive
// listing the given skill directory names.
func writeEmbedFile(skillsDir string, dirs []string) error {
	if len(dirs) == 0 {
		return nil
	}
	sort.Strings(dirs)
	var sb strings.Builder
	sb.WriteString("// Code generated by cli/hack/buildskills. DO NOT EDIT.\n\n")
	sb.WriteString("package skills\n\n")
	sb.WriteString("import \"embed\"\n\n")
	sb.WriteString("// FS contains the embedded CLI skill documentation.\n")
	sb.WriteString("//go:embed")
	for _, d := range dirs {
		sb.WriteString(" ")
		sb.WriteString(d)
	}
	sb.WriteString("\nvar FS embed.FS\n")
	return os.WriteFile(filepath.Join(skillsDir, "embed.go"), []byte(sb.String()), 0o644)
}

func fatal(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "buildskills: "+format+"\n", args...)
	os.Exit(1)
}
