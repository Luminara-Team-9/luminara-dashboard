#!/bin/bash
# Luminara Audit Pipeline - Phoo
# run_lighthouse.js handles all Lighthouse runs (mobile, all categories).
# LHCI upload reads from ./results via staticDistDir.
# DB insert is handled by 유유's ETL pipeline from LHCI.

set -e

PROJECT_ROOT="/abr/coss41/shared_workspace/phoo_workspace/codebase/luminara-dashboard"
RESULTS_DIR="$PROJECT_ROOT/4_automation_tests/lighthouse-runner/results"
NODE="/abr/coss41/.nvm/versions/node/v20.20.2/bin/node"
RUNNER_SCRIPT="$PROJECT_ROOT/4_automation_tests/lighthouse-runner/run_lighthouse.js"
WORKSPACE="/abr/coss41/shared_workspace/phoo_workspace/codebase"
LHCI_DIR="$PROJECT_ROOT/4_automation_tests/lighthouse-runner"

echo "Luminara Audit Pipeline Starting"

mkdir -p "$RESULTS_DIR"

echo "Cleaning old results..."
rm -f "$RESULTS_DIR"/*.json

# FIX:
# clean old Chrome processes before starting
echo ""
echo "Cleaning old Chrome processes..."

pkill -f chrome || true
pkill -f chromium || true
pkill -f lighthouse || true

sleep 3

# RUN LIGHTHOUSE — all pages, all runs, mobile config (handled by run_lighthouse.js)
echo ""
echo "Running Lighthouse audits..."

singularity exec \
  --bind "$WORKSPACE:/workspace" \
  /abr/coss41/shared_workspace/images_dev/infrastructure_audit_ephemeral_dev.sif \
  "$NODE" "$RUNNER_SCRIPT"

echo "Lighthouse audits done!"

# UPLOAD TO LHCI SERVER
echo ""
echo "Uploading to LHCI server..."

cd "$LHCI_DIR"

npx @lhci/cli autorun

echo "LHCI upload complete!"

echo ""
echo "Pipeline Complete!"