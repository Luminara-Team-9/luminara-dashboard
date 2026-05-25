#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$HOME/shared_workspace/yuyu_workspace/codebase/luminara-dashboard"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/etl_rag_daily.log"

mkdir -p "$LOG_DIR"

echo "==================================================" >> "$LOG_FILE"
echo "[START] ETL + RAG update: $(date)" >> "$LOG_FILE"
echo "==================================================" >> "$LOG_FILE"

cd "$PROJECT_ROOT"
source .venv/bin/activate

echo "[1/3] Running ETL auto..." >> "$LOG_FILE"
cd "$PROJECT_ROOT/3_data_ai_pipeline/etl"
python3 pipeline.py --auto >> "$LOG_FILE" 2>&1

echo "[2/3] Checking RAG service health..." >> "$LOG_FILE"
curl -sf http://localhost:9020/health >> "$LOG_FILE" 2>&1

echo "" >> "$LOG_FILE"
echo "[3/3] Updating RAG documents through rag_service..." >> "$LOG_FILE"
curl -sf -X POST http://localhost:9020/update \
  -H "Content-Type: application/json" \
  -d '{"only":"opportunities","force":false}' >> "$LOG_FILE" 2>&1

echo "" >> "$LOG_FILE"
echo "[DONE] ETL + RAG update complete: $(date)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"