#!/bin/bash
# start_workers.sh
#
# Manages Luminara workers via systemd (production-grade).
# Auto-restarts on crash, survives server reboots.
#
# Usage:
#   bash start_workers.sh            # start all workers
#   bash start_workers.sh stop       # stop all workers
#   bash start_workers.sh restart    # restart all workers
#   bash start_workers.sh status     # show status
#   bash start_workers.sh logs       # tail live logs

SERVICES=(
    luminara-apply-worker
    luminara-post-apply-worker
    luminara-rag-service
)

if [[ "$1" == "stop" ]]; then
    echo "[workers] Stopping..."
    for svc in "${SERVICES[@]}"; do
        systemctl --user stop "${svc}.service" 2>/dev/null \
            && echo "  ${svc} stopped" \
            || echo "  ${svc} was not running"
    done
    exit 0
fi

if [[ "$1" == "restart" ]]; then
    echo "[workers] Restarting..."
    for svc in "${SERVICES[@]}"; do
        systemctl --user restart "${svc}.service" \
            && echo "  ${svc} restarted"
    done
    exit 0
fi

if [[ "$1" == "status" ]]; then
    for svc in "${SERVICES[@]}"; do
        systemctl --user status "${svc}.service" --no-pager -l
        echo ""
    done
    exit 0
fi

if [[ "$1" == "logs" ]]; then
    journalctl --user -f \
        -u luminara-apply-worker \
        -u luminara-post-apply-worker \
        -u luminara-rag-service
    exit 0
fi

# ── Start ────────────────────────────────────────────────────────
echo "[workers] Starting..."
for svc in "${SERVICES[@]}"; do
    if systemctl --user is-active "${svc}.service" >/dev/null 2>&1; then
        echo "  ${svc} already running — skipping"
    else
        systemctl --user start "${svc}.service" \
            && echo "  ${svc} started"
    fi
done

echo ""
echo "Workers running. To watch logs:"
echo "  bash start_workers.sh logs"
echo "  journalctl --user -f -u luminara-apply-worker"
echo "  journalctl --user -f -u luminara-post-apply-worker"
echo "  journalctl --user -f -u luminara-rag-service"
echo ""
echo "To stop:    bash start_workers.sh stop"
echo "To restart: bash start_workers.sh restart"
echo "To status:  bash start_workers.sh status"
echo ""

# ── Health checks ────────────────────────────────────────────────
echo "Checking services..."
sleep 5
curl -s http://localhost:9010/health && echo "  ✅ listener (9010)" || echo "  ❌ listener (9010) not responding"
curl -s http://localhost:9020/health | grep -q "ok" \
    && echo "  ✅ rag_service (9020)" \
    || echo "  ⏳ rag_service (9020) still loading model — check: journalctl --user -f -u luminara-rag-service"
