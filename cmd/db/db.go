package db

import (
	"github.com/spf13/cobra"
)

// NewDBCommand creates the db command
func NewDBCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "db",
		Short: "Database operations",
		Long:  `Manage database connections through secure tunnels.`,
	}

	// Add db subcommands
	cmd.AddCommand(NewConnectCommand())

	return cmd
}

