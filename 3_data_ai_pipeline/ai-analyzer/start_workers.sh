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

echo ""
echo "Workers running. To watch logs:"
echo "  tmux attach -t apply_worker"
echo "  tmux attach -t post_apply_worker"
echo ""
echo "To stop:"
echo "  bash start_workers.sh stop"
