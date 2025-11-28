# Using af-cli as a Git Submodule

This repository is designed to be used as a git submodule in the main API Frenzy project.

## Adding as a Submodule

From the main API Frenzy repository:

```bash
git submodule add https://github.com/api-frenzy/af-cli.git cli
git submodule update --init --recursive
```

## Updating the Submodule

To update the CLI to the latest version:

```bash
cd cli
git pull origin main
cd ..
git add cli
git commit -m "Update CLI submodule"
```

## Development Workflow

When working on the CLI:

1. Make changes in the submodule directory:
```bash
cd cli
git checkout -b feature/your-feature
# Make your changes
npm install  # Install dependencies
npm link     # Test locally
git add .
git commit -m "Your changes"
git push origin feature/your-feature
```

2. Create a pull request in the af-cli repository

3. After merging, update the submodule reference in the main repo:
```bash
cd cli
git checkout main
git pull
cd ..
git add cli
git commit -m "Update CLI submodule to latest"
```

## Why a Separate Repository?

The CLI tool is maintained as a separate public repository because:
- It can be distributed independently via npm
- Users can install globally: `npm install -g @api-frenzy/cli`
- It has its own release cycle and versioning
- It maintains a clear separation of concerns
- Easy to update: `npm update -g @api-frenzy/cli`
