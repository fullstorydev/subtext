package auth

import (
	"errors"
	"io"
	"os"
	"strings"
)

// ErrNoAPIKey is returned when no API key can be found in any source.
var ErrNoAPIKey = errors.New("no API key found; set SUBTEXT_API_KEY or pass --api-key")

// Resolved holds the API key and the name of the source it came from.
type Resolved struct {
	Key    string
	Source string // "flag", "env:SUBTEXT_API_KEY", "env:SECRET_SUBTEXT_API_KEY", "env:FULLSTORY_API_KEY", "config"
}

// ResolveAPIKey resolves the API key using this precedence:
//
//  1. flagValue (non-empty, or "-" to read from stdin)
//  2. SUBTEXT_API_KEY env var
//  3. SECRET_SUBTEXT_API_KEY env var (legacy)
//  4. FULLSTORY_API_KEY env var (legacy)
//  5. configKey (from config file, lowest priority)
func ResolveAPIKey(flagValue, configKey string) (Resolved, error) {
	if flagValue != "" {
		if flagValue == "-" {
			key, err := readStdin()
			if err != nil {
				return Resolved{}, err
			}
			return Resolved{Key: key, Source: "flag"}, nil
		}
		return Resolved{Key: flagValue, Source: "flag"}, nil
	}

	if v := os.Getenv("SUBTEXT_API_KEY"); v != "" {
		return Resolved{Key: v, Source: "env:SUBTEXT_API_KEY"}, nil
	}

	if v := os.Getenv("SECRET_SUBTEXT_API_KEY"); v != "" {
		return Resolved{Key: v, Source: "env:SECRET_SUBTEXT_API_KEY"}, nil
	}

	if v := os.Getenv("FULLSTORY_API_KEY"); v != "" {
		return Resolved{Key: v, Source: "env:FULLSTORY_API_KEY"}, nil
	}

	if configKey != "" {
		return Resolved{Key: configKey, Source: "config"}, nil
	}

	return Resolved{}, ErrNoAPIKey
}

func readStdin() (string, error) {
	b, err := io.ReadAll(os.Stdin)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(b)), nil
}
