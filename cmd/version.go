package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var (
	Version   = "dev"
	GitCommit = "unknown"
	BuildTime = "unknown"
)

// NewVersionCommand creates the version command
func NewVersionCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "version",
		Short: "Print the version number of af-cli",
		Long:  `Display the version, git commit, and build time of af-cli`,
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("af-cli version %s\n", Version)
			fmt.Printf("Git commit: %s\n", GitCommit)
			fmt.Printf("Built: %s\n", BuildTime)
		},
	}
	return cmd
}

