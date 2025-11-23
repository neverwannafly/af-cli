package db

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var (
	username   string
	password   string
	localPort  string
	remotePort string
	remoteHost string
	database   string
)

// NewConnectCommand creates the connect command
func NewConnectCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "connect <tunnel_url> -u <username> -p <password> -d <database>",
		Short: "Connect to a database using wstunnel",
		Long: `Connect to a database through wstunnel for secure tunneling.
Automatically starts the tunnel in the background and launches a psql session.
The tunnel_url can be: http://host:port, https://host:port, ws://host:port, or wss://host:port

Required flags: --username, --password, --database`,
		Args: cobra.ExactArgs(1),
		RunE: runConnect,
	}

	cmd.Flags().StringVarP(&username, "username", "u", "", "Database username (required)")
	cmd.Flags().StringVarP(&password, "password", "p", "", "Database password (required)")
	cmd.Flags().StringVarP(&database, "database", "d", "", "Database name (required)")
	cmd.Flags().StringVarP(&localPort, "local-port", "l", "5432", "Local port to bind to")
	cmd.Flags().StringVar(&remotePort, "remote-port", "5432", "Remote database port")
	cmd.Flags().StringVar(&remoteHost, "remote-host", "localhost", "Remote database host")
	cmd.MarkFlagRequired("username")
	cmd.MarkFlagRequired("password")
	cmd.MarkFlagRequired("database")

	return cmd
}

func runConnect(cmd *cobra.Command, args []string) error {
	dbURL := args[0]

	// Check if wstunnel is installed
	if !isWstunnelInstalled() {
		return fmt.Errorf("wstunnel is not installed. Please install it first:\n" +
			"  Linux: Download from https://github.com/erebe/wstunnel/releases\n" +
			"  Mac: brew install wstunnel")
	}

	green := color.New(color.FgGreen).SprintFunc()
	yellow := color.New(color.FgYellow).SprintFunc()
	cyan := color.New(color.FgCyan).SprintFunc()

	fmt.Printf("%s Setting up database tunnel...\n", green("[OK]"))
	fmt.Printf("%s WebSocket Server: %s\n", cyan("[->]"), dbURL)
	fmt.Printf("%s Local Port: %s\n", cyan("[->]"), localPort)
	fmt.Printf("%s Remote Target: %s:%s\n", cyan("[->]"), remoteHost, remotePort)
	fmt.Printf("%s Database: %s\n", cyan("[->]"), database)
	fmt.Printf("%s Username: %s\n", cyan("[->]"), username)

	// Setup wstunnel command
	// Format: wstunnel client -L tcp://127.0.0.1:5432:host:port ws://tunnel-server
	wstunnelCmd := buildWstunnelCommand(dbURL, username, password, localPort, remoteHost, remotePort)

	fmt.Printf("\n%s Starting wstunnel in background...\n", yellow("[!]"))
	fmt.Printf("%s Command: %s\n", cyan("[->]"), wstunnelCmd.String())
	fmt.Println()

	// Start the tunnel in background
	if err := wstunnelCmd.Start(); err != nil {
		return fmt.Errorf("failed to start wstunnel: %w", err)
	}

	// Store tunnel process for cleanup
	tunnelProcess := wstunnelCmd.Process

	// Cleanup function to ensure tunnel is killed
	cleanup := func() {
		if tunnelProcess != nil {
			fmt.Printf("\n%s Shutting down tunnel...\n", yellow("[!]"))
			tunnelProcess.Signal(syscall.SIGTERM)

			// Give it a moment to terminate gracefully
			time.Sleep(500 * time.Millisecond)

			// Force kill if still running
			tunnelProcess.Kill()
		}
	}
	defer cleanup()

	// Setup signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Handle signals in goroutine
	go func() {
		<-sigChan
		cleanup()
		os.Exit(0)
	}()

	// Wait for tunnel to establish
	fmt.Printf("%s Waiting for tunnel to establish...\n", yellow("[!]"))
	time.Sleep(2 * time.Second)

	fmt.Printf("%s Tunnel established!\n", green("[OK]"))
	fmt.Printf("%s Starting psql session...\n\n", green("[OK]"))

	// Start psql session
	psqlCmd := exec.Command("psql",
		"-h", "localhost",
		"-p", localPort,
		"-U", username,
		"-d", database,
	)

	// Set password via environment variable
	psqlCmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", password))

	// Connect psql to current terminal
	psqlCmd.Stdin = os.Stdin
	psqlCmd.Stdout = os.Stdout
	psqlCmd.Stderr = os.Stderr

	// Run psql
	if err := psqlCmd.Run(); err != nil {
		// Check if psql is installed
		if _, pathErr := exec.LookPath("psql"); pathErr != nil {
			fmt.Printf("\n%s psql is not installed. Please install PostgreSQL client.\n", yellow("[WARN]"))
			fmt.Printf("%s Tunnel is running at localhost:%s\n", cyan("[->]"), localPort)
			fmt.Printf("%s You can connect manually with:\n", cyan("[->]"))
			fmt.Printf("  PGPASSWORD=%s psql -h localhost -p %s -U %s -d %s\n", password, localPort, username, database)
			fmt.Printf("%s Press Ctrl+C to close tunnel.\n", cyan("[->]"))

			// Wait for user interrupt
			<-sigChan
			return nil
		}
		return fmt.Errorf("psql error: %w", err)
	}

	fmt.Printf("\n%s Session ended.\n", green("[OK]"))
	return nil
}

func isWstunnelInstalled() bool {
	_, err := exec.LookPath("wstunnel")
	return err == nil
}

func buildWstunnelCommand(dbURL, username, password, localPort, remoteHost, remotePort string) *exec.Cmd {
	// Parse the provided URL to convert to WebSocket format
	// Expected input: http://host:port or https://host:port
	// Output format: wstunnel client -L tcp://127.0.0.1:5432:localhost:5432 ws://host:port

	wsURL := dbURL
	// Convert http:// to ws:// and https:// to wss://
	if len(wsURL) >= 7 && wsURL[:7] == "http://" {
		wsURL = "ws://" + wsURL[7:]
	} else if len(wsURL) >= 8 && wsURL[:8] == "https://" {
		wsURL = "wss://" + wsURL[8:]
	} else if len(wsURL) >= 5 && wsURL[:5] == "ws://" {
		// Already websocket, keep as is
	} else if len(wsURL) >= 6 && wsURL[:6] == "wss://" {
		// Already secure websocket, keep as is
	}

	// Construct wstunnel command
	// Format: wstunnel client -L tcp://127.0.0.1:LOCAL_PORT:REMOTE_HOST:REMOTE_PORT WS_SERVER_URL
	args := []string{
		"client",
		"-L", fmt.Sprintf("tcp://127.0.0.1:%s:%s:%s", localPort, remoteHost, remotePort),
		wsURL,
	}

	cmd := exec.Command("wstunnel", args...)
	// Capture tunnel output but don't block
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	return cmd
}

