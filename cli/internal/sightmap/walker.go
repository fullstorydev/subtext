package sightmap

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v2"
)

// Component is a single named element with fully-resolved CSS selectors.
type Component struct {
	Name      string   `json:"name"`
	Selectors []string `json:"selectors"`
	Source    string   `json:"source"`
	Memory    []string `json:"memory"`
}

// Payload is the JSON body sent to the sightmap upload endpoint.
type Payload struct {
	Sightmap []Component `json:"sightmap"`
	Memory   []string    `json:"memory"`
}

// Collect walks root/.sightmap/**/*.{yaml,yml}, parses each file, and returns
// the combined payload. Returns an empty payload (not an error) when no files
// are found.
func Collect(root string) (Payload, error) {
	files, err := findFiles(root)
	if err != nil {
		return Payload{}, err
	}
	var p Payload
	for _, path := range files {
		comps, mem, err := parseFile(path)
		if err != nil {
			return Payload{}, fmt.Errorf("sightmap: parse %s: %w", path, err)
		}
		p.Sightmap = append(p.Sightmap, comps...)
		p.Memory = append(p.Memory, mem...)
	}
	return p, nil
}

// FindRoot resolves the sightmap root directory using this precedence:
//
//  1. SIGHTMAP_ROOT env var
//  2. configRoot (from config file, if non-empty)
//  3. Walk up from cwd looking for a directory that contains .sightmap/
func FindRoot(cwd, configRoot string) (string, error) {
	if v := os.Getenv("SIGHTMAP_ROOT"); v != "" {
		return v, nil
	}
	if configRoot != "" {
		return configRoot, nil
	}
	d := cwd
	for {
		if fi, err := os.Stat(filepath.Join(d, ".sightmap")); err == nil && fi.IsDir() {
			return d, nil
		}
		parent := filepath.Dir(d)
		if parent == d {
			break
		}
		d = parent
	}
	return "", fmt.Errorf("no .sightmap/ directory found (searched from %s)", cwd)
}

// findFiles returns all *.yaml / *.yml files under root/.sightmap/, sorted by
// directory then by name within each directory (matches Python behaviour).
func findFiles(root string) ([]string, error) {
	sdir := filepath.Join(root, ".sightmap")
	if _, err := os.Stat(sdir); os.IsNotExist(err) {
		return nil, nil
	}
	var files []string
	err := filepath.Walk(sdir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		if strings.HasSuffix(info.Name(), ".yaml") || strings.HasSuffix(info.Name(), ".yml") {
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	// filepath.Walk already returns paths in lexical order, but sort explicitly
	// to match the Python sorted(filenames) per-directory behaviour.
	sort.Strings(files)
	return files, nil
}

// rawComp is the YAML shape of a single component definition.
type rawComp struct {
	Name     string      `yaml:"name"`
	Selector interface{} `yaml:"selector"` // string or []string
	Source   string      `yaml:"source"`
	Memory   interface{} `yaml:"memory"` // string or []string
	Children []rawComp   `yaml:"children"`
}

// rawFile is the top-level YAML shape.
type rawFile struct {
	Components []rawComp `yaml:"components"`
	Views      []struct {
		Components []rawComp `yaml:"components"`
	} `yaml:"views"`
	Memory interface{} `yaml:"memory"` // string or []string
}

func parseFile(path string) ([]Component, []string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, err
	}
	var f rawFile
	if err := yaml.Unmarshal(data, &f); err != nil {
		return nil, nil, err
	}

	var comps []Component
	comps = append(comps, flatten(f.Components, nil, "")...)
	for _, v := range f.Views {
		comps = append(comps, flatten(v.Components, nil, "")...)
	}

	mem := toStringSlice(f.Memory)
	return comps, mem, nil
}

// flatten recursively flattens hierarchical component definitions into a flat
// list. Children inherit parent selectors as prefixes (descendant combinator)
// and the parent source when they don't define their own.
func flatten(comps []rawComp, parentSelectors []string, parentSource string) []Component {
	var result []Component
	for _, c := range comps {
		source := c.Source
		if source == "" {
			source = parentSource
		}

		selectors := toStringSlice(c.Selector)

		// Build full selector chains.
		var full []string
		if len(parentSelectors) > 0 && len(selectors) > 0 {
			for _, p := range parentSelectors {
				for _, s := range selectors {
					full = append(full, p+" "+s)
				}
			}
		} else if len(parentSelectors) > 0 {
			full = append(full, parentSelectors...)
		} else {
			full = append(full, selectors...)
		}

		if c.Name != "" && len(full) > 0 {
			result = append(result, Component{
				Name:      c.Name,
				Selectors: full,
				Source:    source,
				Memory:    toStringSlice(c.Memory),
			})
		}

		result = append(result, flatten(c.Children, full, source)...)
	}
	return result
}

// toStringSlice normalises a YAML value that may be nil, a string, or a
// []interface{} into a []string, filtering empty entries.
func toStringSlice(v interface{}) []string {
	if v == nil {
		return nil
	}
	switch t := v.(type) {
	case string:
		if t == "" {
			return nil
		}
		return []string{t}
	case []interface{}:
		var out []string
		for _, item := range t {
			if s, ok := item.(string); ok && s != "" {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}
