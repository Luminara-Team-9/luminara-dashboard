import subprocess
from datetime import datetime
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel

from agent import build_agent

app = FastAPI()

BASE_DIR = "/abr/coss41/shared_workspace/yuyu_workspace/codebase/luminara-dashboard"
ETL_DIR = f"{BASE_DIR}/3_data_ai_pipeline/etl"
PYTHON = f"{BASE_DIR}/.venv/bin/python3"

# Load LangGraph agent once when listener starts
print("🚀 Loading Remediation Agent once...")
agent_app = build_agent()
print("✅ Remediation Agent ready")


class TriggerPayload(BaseModel):
    # New: direct failed audit target
    test_id: Optional[int] = None

    # Old: fallback target mode
    url: str = "https://www.decathlon.co.kr/"
    page_type: str = "main"
    device_type: str = "desktop"

    max_opportunities: int = 5
    run_etl: bool = False
    dry_run: bool = True


@app.get("/")
def root():
    return {
        "status": "Luminara AI listener is running",
        "message": "Use POST /trigger to run the AI remediation agent",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "time": datetime.now().isoformat(),
    }


@app.post("/trigger")
def trigger(payload: TriggerPayload):
    logs = []

    # Optional ETL step
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

    # Run agent directly in same Python process
    try:
        agent_input = {
            "test_id": payload.test_id,
            "url": payload.url,
            "page_type": payload.page_type,
            "device_type": payload.device_type,
            "dry_run": payload.dry_run,
            "max_opportunities": payload.max_opportunities,
            "should_end": False,
            "opp_index": 0,
        }

        result = agent_app.invoke(agent_input)

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
            "url": result.get("url"),
            "page_type": result.get("page_type"),
            "device_type": result.get("device_type"),
            "max_opportunities": payload.max_opportunities,
            "dry_run": payload.dry_run,
            "logs": logs,
        }

    except Exception as e:
        return {
            "status": "agent_failed",
            "error": str(e),
            "logs": logs,
        }