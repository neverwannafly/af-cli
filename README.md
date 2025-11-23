# API Frenzy CLI

Command-line interface for the API Frenzy platform.

## Installation

### Prerequisites

Requires `wstunnel` for database connections.

**Linux:**
```bash
wget https://github.com/erebe/wstunnel/releases/latest/download/wstunnel-linux-amd64
chmod +x wstunnel-linux-amd64
sudo mv wstunnel-linux-amd64 /usr/local/bin/wstunnel
```

**macOS:**
```bash
brew install wstunnel
```

### Install af-cli

**From Binary:**

```bash
# Linux (amd64)
wget https://github.com/api-frenzy/af-cli/releases/latest/download/af-cli-linux-amd64.tar.gz
tar -xzf af-cli-linux-amd64.tar.gz
sudo mv af-cli-linux-amd64 /usr/local/bin/af-cli
sudo chmod +x /usr/local/bin/af-cli

# macOS (Intel)
curl -L https://github.com/api-frenzy/af-cli/releases/latest/download/af-cli-darwin-amd64.tar.gz -o af-cli.tar.gz
tar -xzf af-cli.tar.gz
sudo mv af-cli-darwin-amd64 /usr/local/bin/af-cli
sudo chmod +x /usr/local/bin/af-cli

# macOS (Apple Silicon)
curl -L https://github.com/api-frenzy/af-cli/releases/latest/download/af-cli-darwin-arm64.tar.gz -o af-cli.tar.gz
tar -xzf af-cli.tar.gz
sudo mv af-cli-darwin-arm64 /usr/local/bin/af-cli
sudo chmod +x /usr/local/bin/af-cli
```

**From Source:**
```bash
git clone https://github.com/api-frenzy/af-cli.git
cd af-cli
make install
```

## Commands

### Database Connection

Connect to a database through a tunnel. The CLI automatically starts the tunnel in the background and launches a psql session. When you exit psql, the tunnel is automatically closed.

```bash
af-cli db connect <tunnel_url> --username <username> --password <password> --database <database>
```

**Required Flags:**
- `--username, -u` - Database username
- `--password, -p` - Database password
- `--database, -d` - Database name

**Optional Flags:**
- `--local-port, -l` - Local port to bind (default: 5432)
- `--remote-host` - Remote database host (default: localhost)
- `--remote-port` - Remote database port (default: 5432)

**Examples:**

```bash
# Basic connection (opens psql automatically)
af-cli db connect http://tunnel.example.com:8000 -u admin -p password -d postgres

# Connect to specific database
af-cli db connect http://tunnel.example.com:8000 -u admin -p password -d myapp

# With custom local port
af-cli db connect https://tunnel.example.com -u admin -p password -d myapp -l 5433

# With custom remote target
af-cli db connect http://tunnel.example.com:8000 -u admin -p password -d myapp --remote-host db.internal --remote-port 3306
```

**Behavior:**
1. Starts wstunnel in the background
2. Automatically launches psql and connects to the database
3. When you exit psql (type `\q` or Ctrl+D), the tunnel automatically closes
4. If psql is not installed, the tunnel stays open and you can connect manually

### Version

Display version information.

```bash
af-cli version
```

## Project Structure

```
af-cli/
├── cmd/
│   ├── root.go           # Root command
│   ├── version.go        # Version command
│   └── db/               # Database module
│       ├── db.go         # DB parent command
│       └── connect.go    # DB connect subcommand
├── go.mod                # Go dependencies
├── main.go               # Entry point
├── Makefile              # Build automation
└── README.md             # Documentation
```

Each command module has its own folder with self-contained command definitions.

## Development

### Building

```bash
# Current platform
make build

# All platforms
make build-all

# Specific platform
make build-linux
make build-mac
make build-mac-arm64
```

### Adding New Commands

1. Create a new folder under `cmd/` for your module (e.g., `cmd/deploy/`)
2. Create `module.go` with the parent command
3. Add subcommands in separate files (e.g., `list.go`, `create.go`)
4. Register the module in `cmd/root.go`

Example:
```go
// cmd/deploy/deploy.go
package deploy

func NewDeployCommand() *cobra.Command {
    cmd := &cobra.Command{
        Use:   "deploy",
        Short: "Deployment operations",
    }
    cmd.AddCommand(NewListCommand())
    return cmd
}

// cmd/root.go
import "github.com/api-frenzy/af-cli/cmd/deploy"
rootCmd.AddCommand(deploy.NewDeployCommand())
```

### Testing

```bash
make test
```

### Creating Release Packages

```bash
make dist
```

## Support

For issues and questions, please open an issue on GitHub.
