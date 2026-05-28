package main

import (
	"os"

	"fs/services/lidar/main/subtext/internal/cli"
)

func main() {
	if err := cli.Execute(); err != nil {
		os.Exit(1)
	}
}
