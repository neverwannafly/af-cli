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

Use the Node version in `.nvmrc`.

```bash
nvm use
```


## Commands

### Version

Display version information.

```bash
af-cli version
```

### OAuth Login

Open the API Frenzy OAuth consent page, complete Authorization Code + PKCE, and store the returned access token for the active profile.

```bash
af-cli login
```

For local development after `npm run build:local`, this logs in against:

```text
http://localhost:8000
```

For production after `npm run build:prod`, this logs in against:

```text
https://apifrenzy.com
```

Options:

```bash
af-cli login --api-base-url http://localhost:8000
```

Logout:

```bash
af-cli logout
```

### Tunnel HTTP

Publish a local HTTP service through API Frenzy.

```bash
af-cli tunnel http <port> --name <name>
```

The command reads configuration from:

```text
~/.config/api-frenzy/config.json
```

Supported config:

```json
{
  "apiBaseUrl": "https://apifrenzy.com",
  "sessionToken": "Bearer ...",
  "defaultTunnelVisibility": "public_access"
}
```

Environment overrides:

- `AF_API_BASE_URL` or `API_FRENZY_API_BASE_URL`
- `AF_SESSION_TOKEN` or `API_FRENZY_SESSION_TOKEN`
- `AF_DEFAULT_TUNNEL_VISIBILITY`

The configured API base URL overrides the build profile default.

Example:

```bash
AF_SESSION_TOKEN="Bearer ..." af-cli tunnel http 3000 --name my-app
```

The tunnel will run until you press Ctrl+C. While it is running, the CLI displays a live in-memory dashboard refreshed every 2 seconds with request count, errors, p50/p95/p99 latency, bytes in/out, a small throughput graph, and the last 100 HTTP/WebSocket events in a table. These logs are process-local and are not written to backend storage.

### Remote Terminal

Open a private browser terminal to the machine running the CLI:

```bash
af-cli tunnel remote --name my-laptop
```

Open the resulting Remote Terminal from the API Frenzy dashboard. It starts your normal login shell in the current directory, as the same OS user that ran the command. Interactive programs such as `tmux`, `vim`, and Codex are supported. Closing or refreshing the browser detaches it without stopping the shell; pressing Ctrl+C in the CLI stops the remote terminal and its shell. Terminal input and output are never written by the CLI's tunnel dashboard.

### Profile

Show the active build profile and API base URL.

```bash
af-cli profile
```

### Private TCP connection

Expose a template-declared service on loopback for any native TCP client. This does not create a public endpoint or consume tunnel quota.

```bash
af-cli tunnel connect my-postgres
psql -h 127.0.0.1 -p 5432

af-cli tunnel connect cache
redis-cli -h 127.0.0.1 -p 6379
```

The deployment template selects the private TCP service and usual local port. Use `--local-port <port>` only to override a busy local port. The CLI never accepts an arbitrary internal host or port.

## Project Structure

```
af-cli/
├── bin/
│   └── af-cli.js         # CLI entry point
├── commands/
│   ├── version.js        # Version command
│   └── tunnel.js         # Tunnel command
├── lib/
│   ├── api-client.js     # API helper
│   ├── config.js         # Config helper
│   └── tunnel-agent.js   # Tunnel agent protocol/client
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

### Build Profiles

Build profiles set the default API base URL when no config or environment override is present:

- `npm run build:local` uses `http://localhost:8000`
- `npm run build:prod` uses `https://apifrenzy.com`

The generated profile is written to `lib/build-profile.generated.json`. Runtime config still has priority over the generated default:

1. `--api-base-url` / `--session-token` command options
2. Environment variables
3. `~/.config/api-frenzy/config.json`
4. Generated build profile

For one-off runs without changing the generated build profile, set `AF_CLI_PROFILE=local` or `AF_CLI_PROFILE=prod`.

### Local Development Build

```bash
# Install dependencies
npm install

# Generate the local build profile
npm run build:local

# Link for local testing
npm link

# Confirm the CLI points at localhost by default
af-cli version
af-cli profile

# Login against the local API/frontend at http://localhost:8000
af-cli login

# Publish a local service once your API Frenzy server is running
af-cli tunnel http 3000 --name my-app
```

Use the local build when the API Frenzy web/API stack is already running on `localhost:8000`.

### Production Build

```bash
# Install dependencies
npm install

# Generate the production build profile
npm run build:prod

# Confirm the CLI points at production by default
node bin/af-cli.js profile

# Optional package dry run before publishing
npm pack --dry-run
```

Use the production build before publishing the npm package so a fresh install defaults to `https://apifrenzy.com`.

### Publishing to npm

```bash
# Build the production profile first
npm run build:prod

# Run syntax checks
npm test

# Login to npm if needed
npm login

# Inspect package contents
npm pack --dry-run

# Publish the public package
npm publish --access public
```

After publishing, verify the package from a clean shell:

```bash
npm install -g @api-frenzy/cli
af-cli profile
af-cli version
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
