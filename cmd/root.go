package cmd

import (
	"github.com/api-frenzy/af-cli/cmd/db"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "af-cli",
	Short: "API Frenzy CLI - Command-line interface for the API Frenzy platform",
	Long: `API Frenzy CLI is a command-line tool for interacting with the API Frenzy platform.
Manage deployments, database connections, and other platform operations.`,
}

// Execute runs the root command
func Execute() error {
	return rootCmd.Execute()
}

func init() {
	// Add subcommand modules
	rootCmd.AddCommand(db.NewDBCommand())
	rootCmd.AddCommand(NewVersionCommand())
}

