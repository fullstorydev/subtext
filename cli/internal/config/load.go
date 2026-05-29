package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v2"
)

// File holds optional settings read from the config file.
// All fields are optional; zero value means "not set" (defer to env/flag).
type File struct {
	APIKey       string `yaml:"api_key"`
	Region       string `yaml:"region"`
	Endpoint     string `yaml:"endpoint"`
	SightmapRoot string `yaml:"sightmap_root"`
}

// Load reads the config file at path and unmarshals it into a File.
// If path is empty, the following locations are tried in order:
//
//  1. $SUBTEXT_CONFIG env var
//  2. $XDG_CONFIG_HOME/subtext/config.yaml
//  3. ~/.config/subtext/config.yaml
//
// A missing file is not an error; it returns a zero-value File.
func Load(path string) (File, error) {
	if path == "" {
		if v := os.Getenv("SUBTEXT_CONFIG"); v != "" {
			path = v
		} else {
			path = defaultPath()
		}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return File{}, nil
		}
		return File{}, fmt.Errorf("config: reading %s: %w", path, err)
	}
	var f File
	if err := yaml.Unmarshal(data, &f); err != nil {
		return File{}, fmt.Errorf("config: parsing %s: %w", path, err)
	}
	return f, nil
}

func defaultPath() string {
	if base := os.Getenv("XDG_CONFIG_HOME"); base != "" {
		return filepath.Join(base, "subtext", "config.yaml")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".config", "subtext", "config.yaml")
}
