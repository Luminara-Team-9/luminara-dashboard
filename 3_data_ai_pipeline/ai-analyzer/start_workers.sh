#!/bin/bash
# start_workers.sh
#
# Start apply_worker and post_apply_worker as persistent tmux sessions.
# Run this once on the server. Workers stay alive until you kill the session.
#
# Usage:
#   bash start_workers.sh          # start both workers
#   bash start_workers.sh stop     # kill both worker sessions

set -e

AI_DIR="$(cd "$(dirname "$0")" && pwd)"
# Venv may be in ai-analyzer/, one level up, or repo root (two levels up)
if [ -f "$AI_DIR/.venv/bin/activate" ]; then
    VENV="$AI_DIR/.venv/bin/activate"
elif [ -f "$(dirname "$AI_DIR")/.venv/bin/activate" ]; then
    VENV="$(dirname "$AI_DIR")/.venv/bin/activate"
else
    VENV="$(dirname "$(dirname "$AI_DIR")")/.venv/bin/activate"
fi

if [[ "$1" == "stop" ]]; then
    echo "[workers] Stopping..."
    tmux kill-session -t apply_worker 2>/dev/null && echo "  apply_worker stopped" || echo "  apply_worker was not running"
    tmux kill-session -t post_apply_worker 2>/dev/null && echo "  post_apply_worker stopped" || echo "  post_apply_worker was not running"
    tmux kill-session -t rag_service 2>/dev/null && echo "  rag_service stopped" || echo "  rag_service was not running"
    exit 0
fi

# ── apply_worker ────────────────────────────────────────────────
if tmux has-session -t apply_worker 2>/dev/null; then
    echo "[apply_worker] Already running (tmux session exists). Skipping."
else
    tmux new-session -d -s apply_worker \
        "source '$VENV' && cd '$AI_DIR' && python apply_worker.py; exec bash"
    echo "[apply_worker] Started in tmux session: apply_worker"
fi

# ── post_apply_worker ───────────────────────────────────────────
if tmux has-session -t post_apply_worker 2>/dev/null; then
    echo "[post_apply_worker] Already running (tmux session exists). Skipping."
else
    tmux new-session -d -s post_apply_worker \
        "source '$VENV' && cd '$AI_DIR' && python post_apply_worker.py; exec bash"
    echo "[post_apply_worker] Started in tmux session: post_apply_worker"
fi

# ── rag_service ─────────────────────────────────────────────────
if tmux has-session -t rag_service 2>/dev/null; then
    echo "[rag_service] Already running (tmux session exists). Skipping."
else
    tmux new-session -d -s rag_service \
        "source '$VENV' && cd '$AI_DIR' && uvicorn rag_service:app --host 0.0.0.0 --port 9020; exec bash"
    echo "[rag_service] Started in tmux session: rag_service"
fi

echo ""
echo "Workers running. To watch logs:"
echo "  tmux attach -t apply_worker"
echo "  tmux attach -t post_apply_worker"
echo "  tmux attach -t rag_service"
echo ""
echo "To stop:"
echo "  bash start_workers.sh stop"
echo ""

# ── Health checks ────────────────────────────────────────────────
echo "Checking services..."
sleep 5
curl -s http://localhost:9010/health && echo "  ✅ listener (9010)" || echo "  ❌ listener (9010) not responding"
curl -s http://localhost:9020/health | grep -q "ok" && echo "  ✅ rag_service (9020)" || echo "  ⏳ rag_service (9020) still loading model — check: tmux attach -t rag_service"
