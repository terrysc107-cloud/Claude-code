#!/usr/bin/env bash
# Add masterbuilder + Ruflo to any existing repo
# Run from inside the target repo:
#   curl -fsSL https://raw.githubusercontent.com/terrysc107-cloud/masterbuilder/main/scripts/add-to-repo.sh | bash

set -euo pipefail

MASTERBUILDER_REPO="https://github.com/terrysc107-cloud/masterbuilder"
TMP_DIR="$(mktemp -d)"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Masterbuilder — Adding to existing repo             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Confirm we're in a git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "ERROR: Not inside a git repository. cd into your project first."
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
echo "▸ Target repo: $REPO_ROOT"

# Check Ruflo is installed, install if not
if ! command -v ruflo &> /dev/null; then
  echo "▸ Ruflo not found — installing..."
  curl -fsSL https://raw.githubusercontent.com/ruvnet/ruflo/main/scripts/install.sh | bash --full
else
  echo "▸ Ruflo: $(ruflo --version 2>/dev/null || echo 'installed') ✓"
fi

# Clone masterbuilder to temp dir
echo "▸ Fetching masterbuilder template..."
git clone --depth 1 "$MASTERBUILDER_REPO" "$TMP_DIR/masterbuilder" --quiet

echo "▸ Copying phase system..."

# Copy core files (don't overwrite existing CLAUDE.md if present)
if [[ ! -f "$REPO_ROOT/CLAUDE.md" ]]; then
  cp "$TMP_DIR/masterbuilder/CLAUDE.md" "$REPO_ROOT/CLAUDE.md"
  echo "  ├─ CLAUDE.md ✓"
else
  echo "  ├─ CLAUDE.md already exists — skipping (keeping yours)"
fi

cp "$TMP_DIR/masterbuilder/BOOTSTRAP.md" "$REPO_ROOT/BOOTSTRAP.md"
echo "  ├─ BOOTSTRAP.md ✓"

# Copy directories
for dir in workflows docs phases templates; do
  if [[ ! -d "$REPO_ROOT/$dir" ]]; then
    cp -r "$TMP_DIR/masterbuilder/$dir" "$REPO_ROOT/$dir"
    echo "  ├─ $dir/ ✓"
  else
    echo "  ├─ $dir/ already exists — merging..."
    cp -rn "$TMP_DIR/masterbuilder/$dir/." "$REPO_ROOT/$dir/" 2>/dev/null || true
    echo "  ├─ $dir/ merged ✓"
  fi
done

# Set up memory dir
mkdir -p "$REPO_ROOT/memory"
for f in DECISIONS.md LEARNINGS.md PATTERNS.md DEBT.md; do
  if [[ ! -f "$REPO_ROOT/memory/$f" ]]; then
    cp "$TMP_DIR/masterbuilder/memory/$f" "$REPO_ROOT/memory/$f"
    echo "  ├─ memory/$f ✓"
  fi
done

# Make run-phase executable
chmod +x "$REPO_ROOT/workflows/run-phase.sh" 2>/dev/null || true

# Run Ruflo init in the target repo
echo ""
echo "▸ Initializing Ruflo..."
cd "$REPO_ROOT"
ruflo init --full 2>&1 | grep -E "created|✓|initialized|Summary" || true

# Start runtime
echo ""
echo "▸ Starting Ruflo runtime..."
ruflo daemon start 2>/dev/null && echo "  ├─ Daemon ✓" || echo "  ├─ Daemon already running"
ruflo memory init 2>/dev/null && echo "  ├─ Memory ✓" || echo "  ├─ Memory already initialized"
ruflo swarm init 2>/dev/null | grep -E "OK|Swarm ID" || true
echo "  └─ Swarm ✓"

# Cleanup
rm -rf "$TMP_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Done. Masterbuilder is ready.                       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Edit memory/DECISIONS.md — describe what you're building"
echo "  2. Run Phase 01: ./workflows/run-phase.sh 01"
echo "  3. Continue through phases 02–11 in order"
echo ""
echo "Full guide: BOOTSTRAP.md"
