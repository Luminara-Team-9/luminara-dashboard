import os
import subprocess
from datetime import datetime
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

BASE_DIR = "/abr/coss41/shared_workspace/yuyu_workspace/codebase/luminara-dashboard"
AI_DIR = f"{BASE_DIR}/3_data_ai_pipeline/ai-analyzer"
ETL_DIR = f"{BASE_DIR}/3_data_ai_pipeline/etl"
PYTHON = f"{BASE_DIR}/.venv/bin/python3"


class TriggerPayload(BaseModel):
    url: str = "https://www.decathlon.co.kr/"
    page_type: str = "main"
    device_type: str = "desktop"
    max_opportunities: int = 5
    run_etl: bool = True
    dry_run: bool = False


@app.get("/")
def root():
    return {"status": "Luminara AI listener is running"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "time": datetime.now().isoformat()
    }


@app.post("/trigger")
def trigger(payload: TriggerPayload):
    logs = []

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

    agent_cmd = [
        PYTHON,
        "agent.py",
        "--url", payload.url,
        "--page-type", payload.page_type,
        "--device-type", payload.device_type,
        "--max-opportunities", str(payload.max_opportunities),
    ]

    if payload.dry_run:
        agent_cmd.append("--dry-run")

    agent_result = subprocess.run(
        agent_cmd,
        cwd=AI_DIR,
        capture_output=True,
        text=True,
        timeout=1200,
    )

    logs.append({
        "step": "agent",
        "command": " ".join(agent_cmd),
        "returncode": agent_result.returncode,
        "stdout": agent_result.stdout[-5000:],
        "stderr": agent_result.stderr[-5000:],
    })

    if agent_result.returncode != 0:
        return {
            "status": "agent_failed",
            "logs": logs,
        }

    return {
        "status": "success",
        "url": payload.url,
        "page_type": payload.page_type,
        "device_type": payload.device_type,
        "max_opportunities": payload.max_opportunities,
        "dry_run": payload.dry_run,
        "logs": logs,
    }