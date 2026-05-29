package cli

import (
	"flag"
	"io"
	"os"
	"path/filepath"
	"testing"
)

// update regenerates golden files when passed as -args -update.
var update = flag.Bool("update", false, "update golden files")

// saveGlobalFlags saves the current globalFlags and restores it after the test.
func saveGlobalFlags(t *testing.T) {
	t.Helper()
	saved := globalFlags
	t.Cleanup(func() { globalFlags = saved })
}

// captureStdout redirects os.Stdout, calls fn, then returns the captured output.
func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	orig := os.Stdout
	os.Stdout = w
	t.Cleanup(func() { os.Stdout = orig })

	fn()

	_ = w.Close()
	os.Stdout = orig

	out, err := io.ReadAll(r)
	_ = r.Close()
	if err != nil {
		t.Fatal(err)
	}
	return string(out)
}

// checkGolden compares got against testdata/<name>.golden.
// Pass -args -update to regenerate.
func checkGolden(t *testing.T, name, got string) {
	t.Helper()
	path := filepath.Join("testdata", name+".golden")
	if *update {
		if err := os.MkdirAll("testdata", 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("golden file %s not found; run with -args -update to create it: %v", path, err)
	}
	if got != string(want) {
		t.Errorf("output mismatch\n--- want ---\n%s\n--- got ---\n%s", want, got)
	}
}
