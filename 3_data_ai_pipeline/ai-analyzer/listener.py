import os
import subprocess
from datetime import datetime
from typing import Optional
import requests
import psycopg2
from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel

from agent import build_agent

load_dotenv()

app = FastAPI()

BASE_DIR = "/abr/coss41/shared_workspace/yuyu_workspace/codebase/luminara-dashboard"
ETL_DIR = f"{BASE_DIR}/3_data_ai_pipeline/etl"
AI_DIR = f"{BASE_DIR}/3_data_ai_pipeline/ai-analyzer"
PYTHON = f"{BASE_DIR}/.venv/bin/python3"

print("🚀 Loading Remediation Agent once...")
agent_app = build_agent()
print("✅ Remediation Agent ready")


def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("HOST_IP"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )


def find_latest_failed_test_id():
    """
    Find the latest target/Decathlon Lighthouse run that failed thresholds.
    Used when CI/CD trigger does not provide test_id.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT test_id
        FROM lighthouse_runs
        WHERE
            site_type IN ('target', 'decathlon')
            AND (
                performance_score < 90
                OR lcp_ms > 2500
                OR tbt_ms > 200
                OR cls_score > 0.1
            )
        ORDER BY created_at DESC
        LIMIT 1
    """)

    row = cursor.fetchone()
    conn.close()

    return row[0] if row else None


class TriggerPayload(BaseModel):
    # Exact failed audit ID if available
    test_id: Optional[int] = None

    # CI/CD metadata from leader workflow
    pr_branch: Optional[str] = None
    target_dir: Optional[str] = None
    thread_id: Optional[str] = None

    # Pipeline controls
    run_etl: bool = True
    update_rag: bool = True
    max_opportunities: int = 1
    dry_run: bool = False


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
    }


@app.post("/api/trigger-agent")
def trigger_agent(payload: TriggerPayload):
    logs = []

    # 1. Run ETL first
    if payload.run_etl:
        etl_cmd = [PYTHON, "pipeline.py", "--auto"]

        etl_result = subprocess.run(
            etl_cmd,
            cwd=ETL_DIR,
            capture_output=True,
            text=True,
            timeout=600,
        )

        logs.append({
            "step": "etl",
            "command": " ".join(etl_cmd),
            "returncode": etl_result.returncode,
            "stdout": etl_result.stdout[-3000:],
            "stderr": etl_result.stderr[-3000:],
        })

        if etl_result.returncode != 0:
            return {
                "status": "etl_failed",
                "logs": logs,
            }

    # 2. Update RAG knowledge base through long-running RAG service
    if payload.update_rag:
        try:
            rag_response = requests.post(
                "http://localhost:9020/update",
                timeout=900,
            )

            rag_json = rag_response.json()

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
        
        
    # 3. Resolve failed test_id
    resolved_test_id = payload.test_id

    if resolved_test_id is None:
        resolved_test_id = find_latest_failed_test_id()
        logs.append({
            "step": "resolve_test_id",
            "mode": "latest_failed_from_db",
            "test_id": resolved_test_id,
        })
    else:
        logs.append({
            "step": "resolve_test_id",
            "mode": "payload_test_id",
            "test_id": resolved_test_id,
        })

    if resolved_test_id is None:
        return {
            "status": "no_failed_audit_found",
            "message": "ETL/RAG finished, but no failed target Lighthouse audit was found.",
            "logs": logs,
        }

    # 4. Run agent using exact test_id
    try:
        result = agent_app.invoke({
            "test_id": resolved_test_id,
            "dry_run": payload.dry_run,
            "max_opportunities": payload.max_opportunities,
            "should_end": False,
            "opp_index": 0,

            # kept for future self-healing/PR patch flow
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
        })

        return {
            "status": "success",
            "test_id": result.get("test_id"),
            "confidence": result.get("confidence"),
            "processed": result.get("opp_index", 0),
            "pr_branch": payload.pr_branch,
            "target_dir": payload.target_dir,
            "thread_id": payload.thread_id,
            "logs": logs,
        }

    except Exception as e:
        return {
            "status": "agent_failed",
            "error": str(e),
            "test_id": resolved_test_id,
            "logs": logs,
        }


# Optional old endpoint for manual tests
@app.post("/trigger")
def trigger(payload: TriggerPayload):
    return trigger_agent(payload)