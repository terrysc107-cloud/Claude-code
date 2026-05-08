#!/usr/bin/env bash
# Run a single masterbuilder phase via Ruflo
# Usage: ./workflows/run-phase.sh <phase-number>
# Example: ./workflows/run-phase.sh 01

set -euo pipefail

PHASE="${1:-}"

if [[ -z "$PHASE" ]]; then
  echo "Usage: $0 <phase-number> (e.g. 01, 02 ... 11)"
  exit 1
fi

WORKFLOWS_DIR="$(cd "$(dirname "$0")" && pwd)"
PHASE_PADDED=$(printf "%02d" "$PHASE")

FILES=("$WORKFLOWS_DIR"/phase-"$PHASE_PADDED"-*.yaml)

if [[ ! -f "${FILES[0]}" ]]; then
  echo "No workflow file found for phase $PHASE_PADDED in $WORKFLOWS_DIR"
  exit 1
fi

WORKFLOW_FILE="${FILES[0]}"
echo "Running: $WORKFLOW_FILE"
ruflo workflow run "$WORKFLOW_FILE"
