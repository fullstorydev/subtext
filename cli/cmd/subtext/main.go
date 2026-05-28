package main

import (
	"os"

	"github.com/fullstorydev/subtext/cli/internal/cli"
)

func main() {
	if err := cli.Execute(); err != nil {
		os.Exit(1)
	}
}
