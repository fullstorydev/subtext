package mcpclient

import (
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"
)

var regionEndpoints = map[string]string{
	"na1": "https://api.fullstory.com/mcp/subtext",
	"eu1": "https://api.eu1.fullstory.com/mcp/subtext",
}

// ResolveEndpoint resolves the MCP endpoint URL using this precedence:
//
//  1. flagEndpoint (--endpoint flag, non-empty)
//  2. SUBTEXT_ENDPOINT env var
//  3. Region map derived from resolveRegion(flagRegion, configRegion)
//  4. configEndpoint (from config file, lowest priority before region fallback)
func ResolveEndpoint(flagEndpoint, flagRegion, configEndpoint, configRegion string) (string, error) {
	if flagEndpoint != "" {
		return validate(flagEndpoint)
	}
	if v := os.Getenv("SUBTEXT_ENDPOINT"); v != "" {
		return validate(v)
	}
	if configEndpoint != "" {
		return validate(configEndpoint)
	}

	region := resolveRegion(flagRegion, configRegion)
	ep, ok := regionEndpoints[region]
	if !ok {
		supported := supportedRegions()
		return "", fmt.Errorf("unknown region %q; supported: %s", region, supported)
	}
	return ep, nil
}

// resolveRegion returns the effective region using: flagRegion > SUBTEXT_REGION > configRegion > "na1".
func resolveRegion(flagRegion, configRegion string) string {
	if flagRegion != "" {
		return flagRegion
	}
	if v := os.Getenv("SUBTEXT_REGION"); v != "" {
		return v
	}
	if configRegion != "" {
		return configRegion
	}
	return "na1"
}

func validate(rawURL string) (string, error) {
	if strings.HasPrefix(rawURL, "https://") {
		return rawURL, nil
	}
	if strings.HasPrefix(rawURL, "http://") {
		if os.Getenv("SUBTEXT_ALLOW_INSECURE_ENDPOINT") == "1" {
			return rawURL, nil
		}
		return "", errors.New("insecure endpoint rejected; set SUBTEXT_ALLOW_INSECURE_ENDPOINT=1 to allow http://")
	}
	return "", fmt.Errorf("endpoint must begin with https:// (got %q)", rawURL)
}

func supportedRegions() string {
	keys := make([]string, 0, len(regionEndpoints))
	for k := range regionEndpoints {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	return strings.Join(keys, ", ")
}
