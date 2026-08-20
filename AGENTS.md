# af-cli Agent Notes

- `af-cli` is a git submodule with its own git history.
- When the task is scoped to CLI work, create and edit only files under `af-cli/`.
- Use the Node version from `.nvmrc`.
- Keep command registration in `bin/af-cli.js`.
- Prefer small command modules under `commands/`.
- Keep platform API access in shared helpers under `lib/` instead of embedding it directly in command files.
- Do not remove the legacy `wstunnel` flow unless explicitly requested.
- Finite commands emit exactly one stdout result through `lib/output.js`; progress and prose go to stderr.
- JSON streams are NDJSON. Never add direct stdout writes under `bin/` or `commands/`.
- `deploy --wait` and `rollback --wait` trust the durable server verification record; do not recreate convergence checks in the client.
- `AF_API_URL` and `AF_TOKEN` are ephemeral CI overrides and must never be persisted.
