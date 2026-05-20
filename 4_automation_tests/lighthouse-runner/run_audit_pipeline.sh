#!/bin/bash
# Luminara Audit Pipeline - Phoo
# Runs Lighthouse on all pages and inserts results into core_db.
# LHCI upload is handled separately by lighthouserc.js:
#   npx @lhci/cli autorun

set -e  # stop if any command fails

PROJECT_ROOT="/abr/coss41/shared_workspace/phoo_workspace/codebase/luminara-dashboard"
RESULTS_DIR="$PROJECT_ROOT/4_automation_tests/lighthouse-runner/results"
SIF="/abr/coss41/shared_workspace/images_dev/infrastructure_audit_ephemeral_dev.sif"
NODE="/abr/coss41/.nvm/versions/node/v20.20.2/bin/node"
INSERT_SCRIPT="$PROJECT_ROOT/4_automation_tests/lighthouse-runner/insert_results.js"
WORKSPACE="/abr/coss41/shared_workspace/phoo_workspace/codebase"

echo "Luminara Audit Pipeline Starting"

# Make sure results folder exists
mkdir -p "$RESULTS_DIR"

# Clean old results
echo "Cleaning old results..."
rm -f "$RESULTS_DIR"/*.json

# run_audit: name, url, run number
run_audit() {
  local name=$1
  local url=$2
  local run=$3

  echo "  Running: $name run $run"

  singularity exec "$SIF" lighthouse "$url" \
    --chrome-flags="--headless --no-sandbox --disable-gpu" \
    --output=json \
    --output-path="$RESULTS_DIR/${name}_run${run}_raw.json" \
    --only-categories=performance,accessibility,best-practices,seo \
    --preset=desktop \
    --no-enable-error-reporting \
    2>/dev/null

  echo "  Done: $name run $run"
}

# DECATHLON PAGES
echo ""
echo "Auditing Decathlon pages..."

run_audit "main"     "https://www.decathlon.co.kr/" 1
run_audit "main"     "https://www.decathlon.co.kr/" 2
run_audit "main"     "https://www.decathlon.co.kr/" 3

run_audit "cart"     "https://www.decathlon.co.kr/cart" 1
run_audit "cart"     "https://www.decathlon.co.kr/cart" 2
run_audit "cart"     "https://www.decathlon.co.kr/cart" 3

run_audit "category" "https://www.decathlon.co.kr/c/first-choice.html?itm_source=hp&itm_medium=circlebanner&itm_campaign=firstchoice-260306" 1
run_audit "category" "https://www.decathlon.co.kr/c/first-choice.html?itm_source=hp&itm_medium=circlebanner&itm_campaign=firstchoice-260306" 2
run_audit "category" "https://www.decathlon.co.kr/c/first-choice.html?itm_source=hp&itm_medium=circlebanner&itm_campaign=firstchoice-260306" 3

run_audit "product"  "https://www.decathlon.co.kr/p/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.html" 1
run_audit "product"  "https://www.decathlon.co.kr/p/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.html" 2
run_audit "product"  "https://www.decathlon.co.kr/p/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.html" 3

echo "Decathlon pages done!"

# COMPETITOR PAGES
echo ""
echo "Auditing Competitor pages..."

run_audit "nike"        "https://www.nike.com/kr" 1
run_audit "nike"        "https://www.nike.com/kr" 2
run_audit "nike"        "https://www.nike.com/kr" 3

run_audit "underarmour" "https://www.underarmour.co.kr/ko-kr/" 1
run_audit "underarmour" "https://www.underarmour.co.kr/ko-kr/" 2
run_audit "underarmour" "https://www.underarmour.co.kr/ko-kr/" 3

run_audit "fila"        "https://www.fila.co.kr/" 1
run_audit "fila"        "https://www.fila.co.kr/" 2
run_audit "fila"        "https://www.fila.co.kr/" 3

echo "Competitor pages done!"

# INSERT INTO DATABASE
echo ""
echo "Inserting results into core_db..."

singularity exec \
  --bind "$WORKSPACE:/workspace" \
  instance://luminara_db_postgres \
  "$NODE" "$INSERT_SCRIPT"

echo "Database insert complete!"
echo "Pipeline Complete!"