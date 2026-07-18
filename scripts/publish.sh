#!/usr/bin/env bash
#
# Publish a new version of @api-frenzy/cli to npm.
#
# Usage (either form works):
#   ./scripts/publish.sh              # patch bump (1.0.0 -> 1.0.1)
#   ./scripts/publish.sh minor        # minor bump (1.0.0 -> 1.1.0)
#   ./scripts/publish.sh major        # major bump (1.0.0 -> 2.0.0)
#   ./scripts/publish.sh 1.4.2        # explicit version
#   ./scripts/publish.sh minor --yes  # skip the confirmation prompt
#
#   npm run release -- minor          # same, via npm (note the `--`)
#
# What it does, in order:
#   1. Preflight: npm auth, clean git tree, correct package.
#   2. Bakes the prod profile so we never ship a `local` build.
#   3. Runs `npm test` (syntax checks).
#   4. Bumps the version, which commits package.json and creates a `vX.Y.Z` tag.
#   5. Publishes to npm (--access public, since the package is scoped).
#   6. Pushes the commit and tag to origin.

set -euo pipefail

# --- helpers ---------------------------------------------------------------
bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '\033[36m▸ %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$1"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# Run from the package root regardless of where the script is invoked.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# --- parse args ------------------------------------------------------------
BUMP="patch"
ASSUME_YES="no"
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES="yes" ;;
    patch|minor|major) BUMP="$arg" ;;
    current|none) BUMP="current" ;;   # publish package.json's version as-is
    [0-9]*.[0-9]*.[0-9]*) BUMP="$arg" ;;
    *) die "Unknown argument: $arg (expected patch|minor|major|current|<version>|--yes)" ;;
  esac
done

PKG_NAME="$(node -p "require('./package.json').name")"
CURRENT_VERSION="$(node -p "require('./package.json').version")"
[ "$PKG_NAME" = "@api-frenzy/cli" ] || die "Unexpected package '$PKG_NAME' — run this from af-cli."

bold "Publishing $PKG_NAME (current: $CURRENT_VERSION, bump: $BUMP)"

# --- preflight -------------------------------------------------------------
info "Checking npm authentication…"
NPM_USER="$(npm whoami 2>/dev/null)" || die "Not logged in to npm. Run: npm login"
ok "npm user: $NPM_USER"

info "Checking git working tree is clean…"
if [ -n "$(git status --porcelain)" ]; then
  git status --short
  die "Working tree is dirty. Commit or stash your changes first (npm version requires a clean tree)."
fi
ok "Working tree clean"

# --- build prod profile ----------------------------------------------------
info "Baking prod profile…"
npm run build:prod >/dev/null
PROFILE="$(node -p "require('./lib/build-profile.generated.json').profile")"
[ "$PROFILE" = "prod" ] || die "Built profile is '$PROFILE', expected 'prod'."
# build:prod may rewrite the generated file; fold that into the release commit.
if [ -n "$(git status --porcelain)" ]; then
  git add lib/build-profile.generated.json
  git commit -m "chore: bake prod profile for release" >/dev/null
  ok "Committed refreshed prod profile"
else
  ok "Prod profile already up to date"
fi

# --- tests -----------------------------------------------------------------
info "Running tests…"
npm test >/dev/null
ok "Tests passed"

# --- confirm ---------------------------------------------------------------
if [ "$ASSUME_YES" != "yes" ]; then
  printf '\033[33mPublish a %s release of %s (currently %s) to npm as %s? [y/N] \033[0m' "$BUMP" "$PKG_NAME" "$CURRENT_VERSION" "$NPM_USER"
  read -r reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *) die "Aborted." ;;
  esac
fi

# --- version / tag ---------------------------------------------------------
if [ "$BUMP" = "current" ]; then
  NEW_VERSION="v$CURRENT_VERSION"
  info "Publishing the current version $CURRENT_VERSION (no bump)…"
  if git rev-parse "$NEW_VERSION" >/dev/null 2>&1; then
    ok "Tag $NEW_VERSION already exists"
  else
    git tag -a "$NEW_VERSION" -m "chore: release $NEW_VERSION"
    ok "Created tag $NEW_VERSION"
  fi
else
  info "Bumping version ($BUMP)…"
  NEW_VERSION="$(npm version "$BUMP" -m "chore: release v%s")"
  ok "Version is now $NEW_VERSION"
fi

# --- publish ---------------------------------------------------------------
info "Publishing to npm…"
npm publish --access public
ok "Published $PKG_NAME@${NEW_VERSION#v}"

# --- push ------------------------------------------------------------------
info "Pushing commit and tag to origin…"
git push origin HEAD --follow-tags
ok "Pushed $NEW_VERSION"

bold "Done. Verify with: npm view $PKG_NAME version"
