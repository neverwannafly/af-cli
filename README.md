# API Frenzy CLI

Command-line interface for the API Frenzy platform.

## Installation

### From npm (Recommended)

```bash
npm install -g @api-frenzy/cli
```

### From Source

```bash
git clone https://github.com/api-frenzy/af-cli.git
cd af-cli
npm install
npm link
```

### Prerequisites

The CLI requires `wstunnel` for tunnel connections.

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

## Commands

### Version

Display version information.

```bash
af-cli version
```

### Tunnel

Start a tunnel using wstunnel.

```bash
af-cli tunnel <url> [options]
```

**Required:**
- `<url>` - WebSocket server URL (http://, https://, ws://, or wss://)

**Options:**
- `-l, --local-port <port>` - Local port to bind to (default: 5432)
- `--remote-host <host>` - Remote host (default: localhost)
- `--remote-port <port>` - Remote port (default: 5432)

**Examples:**

```bash
# Basic tunnel
af-cli tunnel http://tunnel.example.com:8000

# Custom local port
af-cli tunnel http://tunnel.example.com:8000 -l 5433

# Custom remote target
af-cli tunnel http://tunnel.example.com:8000 --remote-host db.internal --remote-port 3306
```

The tunnel will run until you press Ctrl+C.

## Project Structure

```
af-cli/
├── bin/
│   └── af-cli.js         # CLI entry point
├── commands/
│   ├── version.js        # Version command
│   └── tunnel.js         # Tunnel command
├── package.json          # npm package configuration
└── README.md             # Documentation
```

## Development

### Adding New Commands

1. Create a new file in `commands/` (e.g., `commands/deploy.js`)
2. Export a function that registers the command:

```javascript
function deployCommand(program) {
  program
    .command('deploy')
    .description('Deploy operations')
    .action(() => {
      // Your logic here
    });
}

module.exports = { deployCommand };
```

3. Register it in `bin/af-cli.js`:

```javascript
const { deployCommand } = require('../commands/deploy');
deployCommand(program);
```

### Testing Locally

```bash
# Install dependencies
npm install

# Link for local testing
npm link

# Test the CLI
af-cli version
af-cli tunnel http://example.com:8000
```

### Publishing to npm

```bash
# Login to npm
npm login

# Publish
npm publish --access public
```

## Distribution

### npm Package

Users can install via npm:

```bash
npm install -g @api-frenzy/cli
```

### Update Instructions

```bash
npm update -g @api-frenzy/cli
```

## Support

For issues and questions, please open an issue on GitHub.
