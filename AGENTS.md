# af-cli Agent Notes

- `af-cli` is a git submodule with its own git history.
- When the task is scoped to CLI work, create and edit only files under `af-cli/`.
- Use the Node version from `.nvmrc`.
- Keep command registration in `bin/af-cli.js`.
- Prefer small command modules under `commands/`.
- Keep platform API access in shared helpers under `lib/` instead of embedding it directly in command files.
- Do not remove the legacy `wstunnel` flow unless explicitly requested.
