import os
import subprocess
from datetime import datetime, timedelta
from typing import Optional, Any, Dict, List

import requests
import psycopg2
from dotenv import load_dotenv
from fastapi import FastAPI, Header
from pydantic import BaseModel, Field

from agent import build_agent


load_dotenv()

app = FastAPI(
    title="Luminara Remediation Agent Listener",
    description="Receives CI/CD audit failure triggers and runs the AI remediation agent.",
    version="1.0.0",
)

# ─────────────────────────────────────────────
# Paths / Runtime Config
# ─────────────────────────────────────────────

BASE_DIR = os.getenv(
    "LUMINARA_BASE_DIR",
    "/abr/coss41/shared_workspace/yuyu_workspace/codebase/luminara-dashboard",
)

ETL_DIR = os.getenv(
    "LUMINARA_ETL_DIR",
    f"{BASE_DIR}/3_data_ai_pipeline/etl",
)

AI_DIR = os.getenv(
    "LUMINARA_AI_DIR",
    f"{BASE_DIR}/3_data_ai_pipeline/ai-analyzer",
)

PYTHON = os.getenv(
    "LUMINARA_PYTHON",
    f"{BASE_DIR}/.venv/bin/python3",
)

RAG_SERVICE_URL = os.getenv(
    "RAG_SERVICE_URL",
    "http://localhost:9020",
)

# Optional security.
# If LUMINARA_AGENT_SECRET is empty, secret checking is disabled.
# This means current GitHub Actions payload can still work without changing other people's workflow.
AGENT_SECRET = os.getenv("LUMINARA_AGENT_SECRET")

DEFAULT_LOOKBACK_MINUTES = int(os.getenv("AGENT_TEST_ID_LOOKBACK_MINUTES", "10"))
ETL_TIMEOUT_SECONDS = int(os.getenv("AGENT_ETL_TIMEOUT_SECONDS", "600"))
RAG_TIMEOUT_SECONDS = int(os.getenv("AGENT_RAG_TIMEOUT_SECONDS", "900"))


print("🚀 Loading Remediation Agent once...")
agent_app = build_agent()
print("✅ Remediation Agent ready")


# ─────────────────────────────────────────────
# DB Helpers
# ─────────────────────────────────────────────

def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("HOST_IP"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )


def tail_text(value: Optional[str], limit: int = 3000) -> str:
    if not value:
        return ""
    return value[-limit:]


def get_failed_test_candidates_recent(
    triggered_at: datetime,
    lookback_minutes: int,
) -> List[Dict[str, Any]]:
    """
    Find failed target/Decathlon Lighthouse audits created around this trigger time.

    Production-safe rule:
    - 0 candidates  -> no failed audit found
    - 1 candidate   -> safe to use
    - 2+ candidates -> ambiguous, stop instead of choosing the wrong test_id

    We do NOT blindly select latest failed audit because multiple PR audits can run
    concurrently on the self-hosted runner.
    """
    window_start = triggered_at - timedelta(minutes=lookback_minutes)
    window_end = datetime.now() + timedelta(minutes=1)

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT
            test_id,
            url,
            page_type,
            device_type,
            performance_score,
            lcp_ms,
            tbt_ms,
            cls_score,
            created_at
        FROM lighthouse_runs
        WHERE
            site_type IN ('target', 'decathlon')
            AND created_at >= %s
            AND created_at <= %s
            AND (
                performance_score < 90
                OR lcp_ms > 2500
                OR tbt_ms > 200
                OR cls_score > 0.1
            )
        ORDER BY created_at DESC
        LIMIT 10
        """,
        (window_start, window_end),
    )

    rows = cursor.fetchall()
    conn.close()

    candidates = []
    for row in rows:
        (
            test_id,
            url,
            page_type,
            device_type,
            performance_score,
            lcp_ms,
            tbt_ms,
            cls_score,
            created_at,
        ) = row

        candidates.append({
            "test_id": test_id,
            "url": url,
            "page_type": page_type,
            "device_type": device_type,
            "performance_score": float(performance_score) if performance_score is not None else None,
            "lcp_ms": float(lcp_ms) if lcp_ms is not None else None,
            "tbt_ms": float(tbt_ms) if tbt_ms is not None else None,
            "cls_score": float(cls_score) if cls_score is not None else None,
            "created_at": created_at.isoformat() if created_at else None,
        })

    return candidates


# ─────────────────────────────────────────────
# Request Model
# ─────────────────────────────────────────────

class TriggerPayload(BaseModel):
    # Exact failed audit ID if available.
    # Current GitHub Actions does not send this yet, so this remains optional.
    test_id: Optional[int] = None

    # Metadata from leader workflow.
    pr_branch: Optional[str] = None
    target_dir: Optional[str] = None
    thread_id: Optional[str] = None

    # Pipeline controls.
    run_etl: bool = True

    # Production-safe default:
    # Do not update full RAG KB on every PR failure unless explicitly requested.
    update_rag: bool = False

    max_opportunities: int = Field(default=1, ge=1, le=5)
    dry_run: bool = False

    # Used only when test_id is not provided.
    lookback_minutes: int = Field(default=DEFAULT_LOOKBACK_MINUTES, ge=1, le=120)


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status": "Luminara AI listener is running",
        "message": "Use POST /api/trigger-agent",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "time": datetime.now().isoformat(),
        "agent_loaded": True,
        "rag_service_url": RAG_SERVICE_URL,
    }


@app.post("/api/trigger-agent")
def trigger_agent(
    payload: TriggerPayload,
    x_luminara_secret: Optional[str] = Header(default=None),
):
    triggered_at = datetime.now()
    logs: List[Dict[str, Any]] = []

    # ─────────────────────────────────────────
    # 0. Optional secret check
    # ─────────────────────────────────────────
    if AGENT_SECRET:
        if x_luminara_secret != AGENT_SECRET:
            return {
                "status": "unauthorized",
                "message": "Invalid or missing X-Luminara-Secret header.",
            }

    logs.append({
        "step": "trigger_received",
        "time": triggered_at.isoformat(),
        "payload": {
            "test_id": payload.test_id,
            "pr_branch": payload.pr_branch,
            "target_dir": payload.target_dir,
            "thread_id": payload.thread_id,
            "run_etl": payload.run_etl,
            "update_rag": payload.update_rag,
            "max_opportunities": payload.max_opportunities,
            "dry_run": payload.dry_run,
            "lookback_minutes": payload.lookback_minutes,
        },
    })

    # ─────────────────────────────────────────
    # 1. Run ETL first if requested
    # ─────────────────────────────────────────
    if payload.run_etl:
        etl_cmd = [PYTHON, "pipeline.py", "--auto"]

        try:
            etl_result = subprocess.run(
                etl_cmd,
                cwd=ETL_DIR,
                capture_output=True,
                text=True,
                timeout=ETL_TIMEOUT_SECONDS,
            )

            logs.append({
                "step": "etl",
                "command": " ".join(etl_cmd),
                "returncode": etl_result.returncode,
                "stdout": tail_text(etl_result.stdout),
                "stderr": tail_text(etl_result.stderr),
            })

            if etl_result.returncode != 0:
                return {
                    "status": "etl_failed",
                    "logs": logs,
                }

        except subprocess.TimeoutExpired as e:
            logs.append({
                "step": "etl",
                "status": "timeout",
                "timeout_seconds": ETL_TIMEOUT_SECONDS,
                "error": str(e),
            })
            return {
                "status": "etl_timeout",
                "logs": logs,
            }

        except Exception as e:
            logs.append({
                "step": "etl",
                "status": "error",
                "error": str(e),
            })
            return {
                "status": "etl_failed",
                "logs": logs,
            }

    # ─────────────────────────────────────────
    # 2. Update RAG only if explicitly requested
    # ─────────────────────────────────────────
    if payload.update_rag:
        try:
            rag_response = requests.post(
                f"{RAG_SERVICE_URL}/update",
                timeout=RAG_TIMEOUT_SECONDS,
            )

            try:
                rag_json = rag_response.json()
            except Exception:
                rag_json = {
                    "raw_response": tail_text(rag_response.text),
                }

            logs.append({
                "step": "rag_update",
                "mode": "rag_service",
                "status_code": rag_response.status_code,
                "response": rag_json,
            })

            if rag_response.status_code != 200 or rag_json.get("status") != "success":
                return {
                    "status": "rag_update_failed",
                    "logs": logs,
                }

        except requests.Timeout as e:
            logs.append({
                "step": "rag_update",
                "status": "timeout",
                "timeout_seconds": RAG_TIMEOUT_SECONDS,
                "error": str(e),
            })
            return {
                "status": "rag_update_timeout",
                "logs": logs,
            }

        except Exception as e:
            logs.append({
                "step": "rag_update",
                "mode": "rag_service",
                "error": str(e),
            })

            return {
                "status": "rag_update_failed",
                "logs": logs,
            }

    # ─────────────────────────────────────────
    # 3. Resolve test_id
    # ─────────────────────────────────────────
    resolved_test_id = payload.test_id

    if resolved_test_id is not None:
        logs.append({
            "step": "resolve_test_id",
            "mode": "payload_test_id",
            "test_id": resolved_test_id,
        })

    else:
        try:
            candidates = get_failed_test_candidates_recent(
                triggered_at=triggered_at,
                lookback_minutes=payload.lookback_minutes,
            )

            logs.append({
                "step": "resolve_test_id",
                "mode": "recent_failed_window",
                "lookback_minutes": payload.lookback_minutes,
                "candidate_count": len(candidates),
                "candidates": candidates,
            })

            if len(candidates) == 0:
                return {
                    "status": "no_failed_audit_found",
                    "message": (
                        "ETL finished, but no failed target Lighthouse audit was found "
                        "inside the safe recent time window."
                    ),
                    "logs": logs,
                }

            if len(candidates) > 1:
                return {
                    "status": "ambiguous_failed_audit",
                    "message": (
                        "Multiple failed audits were found in the recent time window. "
                        "Listener stopped to avoid generating a Fix Plan for the wrong PR. "
                        "Provide test_id in the trigger payload for exact resolution."
                    ),
                    "candidate_count": len(candidates),
                    "candidates": candidates,
                    "logs": logs,
                }

            resolved_test_id = candidates[0]["test_id"]

        except Exception as e:
            logs.append({
                "step": "resolve_test_id",
                "mode": "recent_failed_window",
                "status": "error",
                "error": str(e),
            })
            return {
                "status": "resolve_test_id_failed",
                "logs": logs,
            }

    # ─────────────────────────────────────────
    # 4. Run Remediation Agent
    # ─────────────────────────────────────────
    try:
        result = agent_app.invoke({
            "test_id": resolved_test_id,
            "dry_run": payload.dry_run,
            "max_opportunities": payload.max_opportunities,
            "should_end": False,
            "opp_index": 0,

            # Metadata kept for Dashboard tracking and future Agent_Workspace apply flow.
            "pr_branch": payload.pr_branch,
            "target_dir": payload.target_dir,
            "thread_id": payload.thread_id,
        })

        logs.append({
            "step": "agent",
            "status": "completed",
            "test_id": result.get("test_id"),
            "confidence": result.get("confidence"),
            "processed": result.get("opp_index", 0),
            "fix_plan_id": result.get("fix_plan_id"),
        })

        return {
            "status": "success",
            "test_id": result.get("test_id"),
            "fix_plan_id": result.get("fix_plan_id"),
            "confidence": result.get("confidence"),
            "processed": result.get("opp_index", 0),
            "pr_branch": payload.pr_branch,
            "target_dir": payload.target_dir,
            "thread_id": payload.thread_id,
            "logs": logs,
        }

    except Exception as e:
        logs.append({
            "step": "agent",
            "status": "error",
            "error": str(e),
        })

        return {
            "status": "agent_failed",
            "error": str(e),
            "test_id": resolved_test_id,
            "pr_branch": payload.pr_branch,
            "target_dir": payload.target_dir,
            "thread_id": payload.thread_id,
            "logs": logs,
        }


# Optional old endpoint for manual tests
@app.post("/trigger")
def trigger(payload: TriggerPayload):
    return trigger_agent(payload)