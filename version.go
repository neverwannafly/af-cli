package main

import "fmt"

var (
	// Version is the semantic version of the CLI
	Version = "dev"
	// GitCommit is the git commit hash
	GitCommit = "unknown"
	// BuildTime is when the binary was built
	BuildTime = "unknown"
)

// GetVersion returns a formatted version string
func GetVersion() string {
	return fmt.Sprintf("af-cli version %s (commit: %s, built: %s)", Version, GitCommit, BuildTime)
}

