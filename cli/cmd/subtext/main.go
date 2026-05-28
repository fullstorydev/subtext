package main

import (
	"os"

	"github.com/fullstory/subtext/cli/internal/cli"
)

func main() {
	if err := cli.Execute(); err != nil {
		os.Exit(1)
	}
}
