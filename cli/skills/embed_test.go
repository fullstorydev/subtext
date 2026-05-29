package skills_test

import (
	"io/fs"
	"testing"

	"github.com/fullstorydev/subtext/cli/internal/fstesting"
	"github.com/fullstorydev/subtext/cli/skills"
)

// TestEmbeddedSkills verifies that every skill directory in the embedded FS
// contains a readable SKILL.md. This catches a stale embed.go (e.g. a skill
// was added to templates/skills/ but go generate was not re-run).
func TestEmbeddedSkills(t *testing.T) {
	dirs, err := fs.ReadDir(skills.FS, ".")
	fstesting.Ok(t, err, "read embedded FS root")

	fstesting.Assert(t, len(dirs) > 0, "embedded FS should contain at least one skill directory")

	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		name := d.Name()
		t.Run(name, func(t *testing.T) {
			skillPath := name + "/SKILL.md"
			f, err := skills.FS.Open(skillPath)
			fstesting.Ok(t, err, "open %s", skillPath)
			f.Close()
		})
	}
}
