import asyncio
import os
from datetime import datetime
from typing import Optional, Any, Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, Header
from pydantic import BaseModel, Field, model_validator

from agent import build_agent
from lhci_etl import run_etl, sync_etl, link_fix_plan_scores

try:
    from ra_runtime.db_client import update_fix_plan_status, get_fix_plan_by_id, get_fix_plans_list, get_fix_plan_changes
except ImportError:
    from db_client import update_fix_plan_status, get_fix_plan_by_id, get_fix_plans_list, get_fix_plan_changes


load_dotenv()

app = FastAPI(
    title="Luminara Remediation Agent Listener",
    description=(
        "Receives CI/CD audit failure triggers and runs the AI remediation agent. "
        "Production-safe version: no recent-time guessing, no ETL, no RAG update."
    ),
    version="2.0.0",
)

# ─────────────────────────────────────────────
# Runtime Config
# ─────────────────────────────────────────────

BASE_DIR = os.getenv(
    "LUMINARA_BASE_DIR",
    "/abr/coss41/shared_workspace/yuyu_workspace/codebase/luminara-dashboard",
)

AI_DIR = os.getenv(
    "LUMINARA_AI_DIR",
    f"{BASE_DIR}/3_data_ai_pipeline/ai-analyzer",
)

RAG_SERVICE_URL = os.getenv(
    "RAG_SERVICE_URL",
    "http://localhost:9020",
)

# Optional security.
# If LUMINARA_AGENT_SECRET is empty, secret checking is disabled.
AGENT_SECRET = os.getenv("LUMINARA_AGENT_SECRET")

DEFAULT_MAX_OPPORTUNITIES = int(os.getenv("AGENT_MAX_OPPORTUNITIES", "3"))


print("🚀 Loading Remediation Agent once...")
agent_app = build_agent()
print("✅ Remediation Agent ready")


ETL_SYNC_INTERVAL = int(os.getenv("ETL_SYNC_INTERVAL_SECONDS", "10800"))   # default 3 hours
RAG_UPDATE_INTERVAL = int(os.getenv("RAG_UPDATE_INTERVAL_SECONDS", "86400"))  # default 24 hours


@app.on_event("startup")
async def start_background_loops():
    async def _etl_loop():
        while True:
            await asyncio.sleep(ETL_SYNC_INTERVAL)
            try:
                result = sync_etl()
                print(f"[etl/sync] auto: processed={result['processed']} builds", flush=True)
            except Exception as e:
                print(f"[etl/sync] auto error: {e}", flush=True)

    async def _rag_loop():
        await asyncio.sleep(RAG_UPDATE_INTERVAL)  # wait 24h before first run
        while True:
            try:
                import httpx as _httpx
                r = _httpx.post(f"{RAG_SERVICE_URL}/update", timeout=600)
                print(f"[rag/update] auto: status={r.status_code}", flush=True)
            except Exception as e:
                print(f"[rag/update] auto error: {e}", flush=True)
            await asyncio.sleep(RAG_UPDATE_INTERVAL)

    asyncio.create_task(_etl_loop())
    asyncio.create_task(_rag_loop())


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def safe_payload_dict(payload: "TriggerPayload") -> Dict[str, Any]:
    """
    Return payload fields for logs without secrets.
    """
    return {
        "test_id": payload.test_id,
        "playwright_run_id": payload.playwright_run_id,
        "lhci_build_id": payload.lhci_build_id,
        "failed_groups": [
            group.model_dump()
            for group in payload.failed_groups
        ] if payload.failed_groups else [],
        "pr_branch": payload.pr_branch,
        "target_dir": payload.target_dir,
        "thread_id": payload.thread_id,
        "max_opportunities": payload.max_opportunities,
        "dry_run": payload.dry_run,
    }


def build_group_thread_id(base_thread_id: str, group: "FailedGroup") -> str:
    """
    Make a unique thread_id per failed group.

    Reason:
    fix_plans.thread_id is unique, so if one PR has multiple failed groups,
    each group needs a unique thread_id.
    """
    site_type = group.site_type or "unknown_site"
    page_type = group.page_type or "unknown_page"
    device_type = group.device_type or "unknown_device"

    return f"{base_thread_id}_{site_type}_{page_type}_{device_type}"


# ─────────────────────────────────────────────
# Request Models
# ─────────────────────────────────────────────


class FailedGroup(BaseModel):
    """
    One stable audit group.

    Example:
    playwright_run_id = 10
    page_type = product
    device_type = mobile

    Agent will use these values to find the 3 related Lighthouse runs.
    """
    site_type: str = Field(default="decathlon")
    page_type: str
    device_type: str
    url: Optional[str] = None
    network_profile: Optional[str] = None

    @model_validator(mode="after")
    def normalize_page_type(self):
        if self.page_type == "home":
            self.page_type = "main"
        return self


class TriggerPayload(BaseModel):
    """
    Supported trigger formats.

    Production preferred:
    {
      "playwright_run_id": 10,
      "failed_groups": [
        {"site_type": "decathlon", "page_type": "product", "device_type": "mobile"}
      ],
      "pr_branch": "...",
      "target_dir": "...",
      "thread_id": "pr_17"
    }

    Transitional/test mode:
    {
      "test_id": 100,
      "pr_branch": "...",
      "target_dir": "...",
      "thread_id": "manual_test"
    }

    Legacy/minimal mode:
    {
      "pr_branch": "...",
      "target_dir": "...",
      "thread_id": "pr_17"
    }

    In legacy/minimal mode, listener does NOT guess recent audits.
    It returns missing_audit_identity safely.
    """

    # Transitional exact single run input.
    # Agent should resolve sibling 3-run group from this test_id.
    test_id: Optional[int] = None

    playwright_run_id: Optional[str] = None
    lhci_run_id: Optional[str] = None    # sent by GHA clone-audit action (lhci builds.id UUID)
    lhci_build_id: Optional[str] = None  # alias for manual triggers
    failed_groups: List[FailedGroup] = Field(default_factory=list)

    # GitHub / workspace metadata.
    pr_branch: Optional[str] = None
    target_dir: Optional[str] = None
    thread_id: Optional[str] = None

    # Internal controls.
    # Do not require these in GitHub payload.
    max_opportunities: int = Field(default=DEFAULT_MAX_OPPORTUNITIES, ge=1, le=5)
    dry_run: bool = False

    @model_validator(mode="after")
    def validate_basic_metadata(self):
        missing = []

        if not self.pr_branch:
            missing.append("pr_branch")

        if not self.target_dir:
            missing.append("target_dir")

        if not self.thread_id:
            missing.append("thread_id")

        if missing:
            raise ValueError(
                "Missing required metadata fields: " + ", ".join(missing)
            )

        return self


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status": "Luminara AI listener is running",
        "message": "Use POST /api/trigger-agent",
        "version": "2.0.0",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "time": datetime.now().isoformat(),
        "agent_loaded": True,
        "rag_service_url": RAG_SERVICE_URL,
        "default_max_opportunities": DEFAULT_MAX_OPPORTUNITIES,
        "etl_in_listener": False,
        "rag_update_in_listener": False,
        "recent_lookback_fallback": False,
    }


# ─────────────────────────────────────────────
# Dashboard approval endpoint
# Called by 1_dashboard_app when operator clicks "Apply"
# Contract: AI_ACTION_CONTRACT.md
# ─────────────────────────────────────────────

class ApplyRequest(BaseModel):
    actionId: str
    requestedAt: Optional[str] = None
    source: str
    action: str
    planSnapshot: Dict[str, Any]


@app.post("/ai-actions/apply")
def ai_actions_apply(payload: ApplyRequest):
    """
    Receive dashboard approval and set fix_plan patch_status = 'approved_to_apply'.

    The dashboard sends planSnapshot.id which must be the integer fix_plan_id
    (as a string). apply_worker polls for approved_to_apply and picks it up
    automatically — no manual step needed.
    """
    plan_id_raw = payload.planSnapshot.get("id") or payload.actionId

    try:
        fix_plan_id = int(plan_id_raw)
    except (TypeError, ValueError):
        return {
            "actionId": payload.actionId,
            "accepted": False,
            "status": "failed",
            "message": (
                f"planSnapshot.id must be the integer fix_plan_id as a string "
                f"(got: '{plan_id_raw}'). "
                f"Make sure the performance API returns the DB fix_plan id."
            ),
            "source": "remediation-agent",
        }

    fix_plan = get_fix_plan_by_id(fix_plan_id)
    if not fix_plan:
        return {
            "actionId": payload.actionId,
            "accepted": False,
            "status": "failed",
            "message": f"fix_plan_id={fix_plan_id} not found in database.",
            "source": "remediation-agent",
        }

    current_status = fix_plan.get("patch_status")
    if current_status in ("applying", "patch_applied", "build_testing", "pushed"):
        return {
            "actionId": payload.actionId,
            "accepted": False,
            "status": "failed",
            "message": f"fix_plan_id={fix_plan_id} is already in progress (status={current_status}).",
            "source": "remediation-agent",
        }

    approved_by = payload.source or "unknown"
    update_fix_plan_status(fix_plan_id, "approved_to_apply", approved_by=approved_by)

    print(
        f"[ai-actions/apply] fix_plan_id={fix_plan_id} approved by '{approved_by}' → "
        f"patch_status=approved_to_apply  (was: {current_status})",
        flush=True,
    )

    return {
        "actionId": payload.actionId,
        "accepted": True,
        "status": "queued",
        "message": f"fix_plan_id={fix_plan_id} queued for apply. apply_worker will pick it up within 30s.",
        "runId": f"fix-plan-{fix_plan_id}",
        "queuedAt": datetime.now().isoformat(),
        "nextPollMs": 30_000,
        "source": "remediation-agent",
    }


# ─────────────────────────────────────────────
# Developer push approval endpoint
# Called after build_passed — developer confirms ready to push to GitHub
# ─────────────────────────────────────────────

class ApprovePushRequest(BaseModel):
    approved_by: Optional[str] = "dashboard"


@app.post("/api/fix-plans/{fix_plan_id}/approve-push")
def approve_push(fix_plan_id: int, payload: ApprovePushRequest = ApprovePushRequest()):
    """
    Approve a build-passed fix plan for push to GitHub.
    Sets patch_status = 'approved_to_push'.
    post_apply_worker polls for this and handles push + PR creation.
    """
    fix_plan = get_fix_plan_by_id(fix_plan_id)
    if not fix_plan:
        return {
            "accepted": False,
            "status": "failed",
            "message": f"fix_plan_id={fix_plan_id} not found.",
        }

    current_status = fix_plan.get("patch_status")
    if current_status != "build_passed":
        return {
            "accepted": False,
            "status": "failed",
            "message": (
                f"fix_plan_id={fix_plan_id} cannot be approved for push "
                f"(current status: {current_status}). Must be build_passed."
            ),
        }

    approved_by = payload.approved_by or "dashboard"
    update_fix_plan_status(fix_plan_id, "approved_to_push", approved_by=approved_by)

    print(
        f"[approve-push] fix_plan_id={fix_plan_id} approved for push by '{approved_by}' → "
        f"patch_status=approved_to_push",
        flush=True,
    )

    return {
        "accepted": True,
        "status": "approved_to_push",
        "message": f"fix_plan_id={fix_plan_id} approved. post_apply_worker will push and create PR within 30s.",
        "fix_plan_id": fix_plan_id,
        "approvedAt": datetime.now().isoformat(),
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
        "payload": safe_payload_dict(payload),
    })

    # ─────────────────────────────────────────
    # 1. LHCI mode — resolve build ID from lhci DB using pr_branch.
    #    GHA extraction is unreliable (always null), so pr_branch is the primary key.
    #    payload.lhci_build_id / lhci_run_id are still accepted when provided manually.
    # ─────────────────────────────────────────
    _lhci_build_id = payload.lhci_build_id or payload.lhci_run_id or None
    _discovered_groups: list[FailedGroup] = []

    if payload.pr_branch:
        try:
            from ra_runtime.db_client import get_lhci_connection
            import json as _json
            from urllib.parse import urlparse as _urlparse

            def _url_to_page_type(url: str) -> str:
                path = _urlparse(url).path.rstrip("/")
                if not path:
                    return "main"
                parts = [p for p in path.split("/") if p]
                return parts[0] if parts else "main"

            def _device_from_lhr(lhr) -> str:
                if isinstance(lhr, str):
                    lhr = _json.loads(lhr)
                cfg = lhr.get("configSettings", {})
                ff = cfg.get("formFactor") or cfg.get("emulatedFormFactor", "mobile")
                return "mobile" if str(ff).lower() == "mobile" else "desktop"

            _lhci_conn = get_lhci_connection()
            with _lhci_conn.cursor() as _cur:
                # Resolve build ID if not given
                if not _lhci_build_id:
                    _cur.execute(
                        'SELECT id FROM builds WHERE branch = %s ORDER BY "createdAt" DESC LIMIT 1',
                        (payload.pr_branch,)
                    )
                    _row = _cur.fetchone()
                    if _row:
                        _lhci_build_id = str(_row[0])
                        print(f"[trigger] lhci_build_id resolved from branch '{payload.pr_branch}': {_lhci_build_id}", flush=True)

                # Discover all pages actually present in this build
                if _lhci_build_id:
                    _cur.execute(
                        'SELECT DISTINCT ON (url) url, lhr FROM runs WHERE "buildId" = %s::uuid',
                        (_lhci_build_id,)
                    )
                    _seen_groups: set = set()
                    for _url, _lhr_text in _cur.fetchall():
                        _pt = _url_to_page_type(_url)
                        _dt = _device_from_lhr(_lhr_text)
                        _key = (_pt, _dt)
                        if _key not in _seen_groups:
                            _seen_groups.add(_key)
                            _site = (payload.failed_groups[0].site_type if payload.failed_groups else "decathlon")
                            _discovered_groups.append(FailedGroup(
                                site_type=_site,
                                page_type=_pt,
                                device_type=_dt,
                                url=_url,
                                network_profile=None,
                            ))
                    print(f"[trigger] discovered {len(_discovered_groups)} groups from lhci build {_lhci_build_id[:8]}: {[g.page_type for g in _discovered_groups]}", flush=True)
            _lhci_conn.close()
        except Exception as _e:
            import traceback as _tb
            print(f"[trigger] lhci DB resolution failed: {_e}", flush=True)
            _tb.print_exc()

    _active_groups = _discovered_groups if _discovered_groups else payload.failed_groups

    if _lhci_build_id and _active_groups:
        group_results = []

        # Fix PRs always target the same branch that triggered the audit.
        # This allows the developer to merge the fix back into their PR branch
        # and re-run the audit to measure the before/after improvement.
        _fix_base_branch = payload.pr_branch

        for group_index, group in enumerate(_active_groups, start=1):
            group_thread_id = build_group_thread_id(
                base_thread_id=payload.thread_id,
                group=group,
            )

            agent_input = {
                "mode": "audit_group",
                "lhci_build_id": _lhci_build_id,
                "playwright_run_id": None,
                "site_type": group.site_type,
                "page_type": group.page_type,
                "device_type": group.device_type,
                "url": group.url,
                "network_profile": group.network_profile,

                "dry_run": payload.dry_run,
                "max_opportunities": payload.max_opportunities,
                "should_end": False,
                "opp_index": 0,
                "generated_patch_signatures": [],

                "pr_branch": _fix_base_branch,
                "target_dir": payload.target_dir,
                "thread_id": group_thread_id,
                "base_thread_id": payload.thread_id,
                "group_index": group_index,
                "total_groups": len(_active_groups),
            }

            logs.append({
                "step": "agent_start",
                "mode": "lhci_build",
                "group_index": group_index,
                "thread_id": group_thread_id,
                "lhci_build_id": _lhci_build_id,
                "group": group.model_dump(),
            })

            group_started_at = datetime.now()

            try:
                result = agent_app.invoke(agent_input)

                elapsed_seconds = round(
                    (datetime.now() - group_started_at).total_seconds(), 2,
                )

                group_result = {
                    "status": "success",
                    "mode": "lhci_build",
                    "group_index": group_index,
                    "thread_id": group_thread_id,
                    "lhci_build_id": _lhci_build_id,
                    "site_type": group.site_type,
                    "page_type": group.page_type,
                    "device_type": group.device_type,
                    "fix_plan_ids": result.get("fix_plan_ids"),
                    "fix_plan_id": result.get("fix_plan_id"),
                    "confidence": result.get("confidence"),
                    "processed": result.get("opp_index", 0),
                    "elapsed_seconds": elapsed_seconds,
                }

                group_results.append(group_result)
                logs.append({"step": "agent_completed", **group_result})

            except Exception as e:
                import traceback
                print(f"[agent_failed] group={group_index} error={e}", flush=True)
                traceback.print_exc()
                elapsed_seconds = round(
                    (datetime.now() - group_started_at).total_seconds(), 2,
                )
                group_result = {
                    "status": "agent_failed",
                    "mode": "lhci_build",
                    "group_index": group_index,
                    "lhci_build_id": _lhci_build_id,
                    "page_type": group.page_type,
                    "device_type": group.device_type,
                    "error": str(e),
                    "elapsed_seconds": elapsed_seconds,
                }
                group_results.append(group_result)
                logs.append({"step": "agent_failed", **group_result})

        overall_status = (
            "success"
            if all(r["status"] == "success" for r in group_results)
            else "partial_failed"
        )

        try:
            etl_rows = run_etl(_lhci_build_id)
            logs.append({"step": "etl_complete", "lhci_build_id": _lhci_build_id, "rows_inserted": etl_rows})
        except Exception as etl_err:
            logs.append({"step": "etl_failed", "lhci_build_id": _lhci_build_id, "error": str(etl_err)})

        return {
            "status": overall_status,
            "mode": "lhci_build",
            "lhci_build_id": _lhci_build_id,
            "group_count": len(_active_groups),
            "results": group_results,
            "pr_branch": payload.pr_branch,
            "target_dir": payload.target_dir,
            "thread_id": payload.thread_id,
            "total_elapsed_seconds": round(
                (datetime.now() - triggered_at).total_seconds(), 2
            ),
            "logs": logs,
        }

    # ─────────────────────────────────────────
    # 3. Transitional mode:
    #    exact test_id provided
    # ─────────────────────────────────────────
    if payload.test_id is not None:
        agent_input = {
            "mode": "test_id",
            "test_id": payload.test_id,

            # Agent should resolve sibling 3-run group internally.
            "dry_run": payload.dry_run,
            "max_opportunities": payload.max_opportunities,
            "should_end": False,
            "opp_index": 0,
            "generated_patch_signatures": [],

            # Metadata for dashboard/workspace.
            "pr_branch": payload.pr_branch,
            "target_dir": payload.target_dir,
            "thread_id": payload.thread_id,
        }

        logs.append({
            "step": "agent_start",
            "mode": "test_id",
            "test_id": payload.test_id,
            "thread_id": payload.thread_id,
        })

        test_started_at = datetime.now()

        try:
            result = agent_app.invoke(agent_input)

            elapsed_seconds = round(
                (datetime.now() - test_started_at).total_seconds(),
                2,
            )

            logs.append({
                "step": "agent_completed",
                "mode": "test_id",
                "test_id": result.get("test_id"),
                "fix_plan_ids": result.get("fix_plan_ids"),
                "fix_plan_id": result.get("fix_plan_id"),
                "confidence": result.get("confidence"),
                "processed": result.get("opp_index", 0),
                "elapsed_seconds": elapsed_seconds,
            })

            total_elapsed_seconds = round(
                (datetime.now() - triggered_at).total_seconds(),
                2,
            )

            return {
                "status": "success",
                "mode": "test_id",
                "test_id": result.get("test_id", payload.test_id),
                "fix_plan_ids": result.get("fix_plan_ids"),
                "fix_plan_id": result.get("fix_plan_id"),
                "confidence": result.get("confidence"),
                "processed": result.get("opp_index", 0),
                "pr_branch": payload.pr_branch,
                "target_dir": payload.target_dir,
                "thread_id": payload.thread_id,
                "max_opportunities": payload.max_opportunities,
                "dry_run": payload.dry_run,
                "elapsed_seconds": elapsed_seconds,
                "total_elapsed_seconds": total_elapsed_seconds,
                "logs": logs,
            }

        except Exception as e:
            elapsed_seconds = round(
                (datetime.now() - test_started_at).total_seconds(),
                2,
            )

            logs.append({
                "step": "agent_failed",
                "mode": "test_id",
                "test_id": payload.test_id,
                "error": str(e),
                "elapsed_seconds": elapsed_seconds,
            })

            total_elapsed_seconds = round(
                (datetime.now() - triggered_at).total_seconds(),
                2,
            )

            return {
                "status": "agent_failed",
                "mode": "test_id",
                "error": str(e),
                "test_id": payload.test_id,
                "pr_branch": payload.pr_branch,
                "target_dir": payload.target_dir,
                "thread_id": payload.thread_id,
                "max_opportunities": payload.max_opportunities,
                "dry_run": payload.dry_run,
                "elapsed_seconds": elapsed_seconds,
                "total_elapsed_seconds": total_elapsed_seconds,
                "logs": logs,
            }
    # ─────────────────────────────────────────
    # 3. Legacy/minimal payload:
    #    only pr_branch + target_dir + thread_id
    # ─────────────────────────────────────────
    total_elapsed_seconds = round(
        (datetime.now() - triggered_at).total_seconds(),
        2,
    )

    logs.append({
        "step": "missing_audit_identity",
        "elapsed_seconds": total_elapsed_seconds,
        "message": (
            "No test_id and no playwright_run_id + failed_groups were provided. "
            "Listener will not guess by recent time window."
        ),
    })

    return {
        "status": "missing_audit_identity",
        "message": (
            "Trigger payload is missing audit identity. "
            "Provide either test_id OR playwright_run_id + failed_groups. "
            "Recent-time lookback fallback is intentionally disabled for production safety."
        ),
        "required_payload_options": {
            "preferred": {
                "playwright_run_id": 10,
                "failed_groups": [
                    {
                        "site_type": "decathlon",
                        "page_type": "product",
                        "device_type": "mobile",
                    }
                ],
                "pr_branch": "feature/pr-branch",
                "target_dir": "2_digital_twins/active-staging",
                "thread_id": "pr_17",
            },
            "transitional": {
                "test_id": 100,
                "pr_branch": "feature/pr-branch",
                "target_dir": "2_digital_twins/active-staging",
                "thread_id": "pr_17",
            },
        },
        "received": safe_payload_dict(payload),
        "total_elapsed_seconds": total_elapsed_seconds,
        "logs": logs,
    }




# ─────────────────────────────────────────────
# ETL endpoint — triggered by GHA on every build (pass or fail)
# ─────────────────────────────────────────────

class EtlPayload(BaseModel):
    lhci_build_id: str


@app.post("/api/etl")
def trigger_etl(
    payload: EtlPayload,
    x_luminara_secret: Optional[str] = Header(default=None),
):
    """
    Run ETL for a given lhci_build_id.
    GHA calls this after every LHCI build (pass or fail) to persist audit metrics.
    Agent trigger (/api/trigger-agent) only fires on failure.
    """
    if AGENT_SECRET and x_luminara_secret != AGENT_SECRET:
        return {"status": "unauthorized", "message": "Invalid or missing X-Luminara-Secret header."}

    try:
        rows_inserted = run_etl(payload.lhci_build_id)
        print(f"[etl] lhci_build_id={payload.lhci_build_id} rows_inserted={rows_inserted}", flush=True)
        return {
            "status": "success",
            "lhci_build_id": payload.lhci_build_id,
            "rows_inserted": rows_inserted,
        }
    except Exception as e:
        print(f"[etl] ❌ lhci_build_id={payload.lhci_build_id} error={e}", flush=True)
        return {
            "status": "error",
            "lhci_build_id": payload.lhci_build_id,
            "error": str(e),
        }


@app.post("/api/etl/link-scores")
def trigger_link_scores(
    x_luminara_secret: Optional[str] = Header(default=None),
):
    """
    Link LHCI scores from fix branches back to fix_plans.new_local_score.
    Automatically called by sync_etl every 3h. Use this endpoint to trigger on demand.
    """
    if AGENT_SECRET and x_luminara_secret != AGENT_SECRET:
        return {"status": "unauthorized", "message": "Invalid or missing X-Luminara-Secret header."}

    try:
        result = link_fix_plan_scores()
        print(f"[etl/link-scores] linked={result['linked']}", flush=True)
        return {"status": "success", **result}
    except Exception as e:
        print(f"[etl/link-scores] ❌ error={e}", flush=True)
        return {"status": "error", "error": str(e)}


@app.post("/api/etl/sync")
def trigger_etl_sync(
    x_luminara_secret: Optional[str] = Header(default=None),
):
    """
    Find all lhci builds not yet in lhci_audit_runs and ETL each one.
    Called by cron every 5-10 min to automatically pick up every new build.
    Safe to call repeatedly — already-processed builds are skipped.
    """
    if AGENT_SECRET and x_luminara_secret != AGENT_SECRET:
        return {"status": "unauthorized", "message": "Invalid or missing X-Luminara-Secret header."}

    try:
        result = sync_etl()
        print(f"[etl/sync] processed={result['processed']}", flush=True)
        return {"status": "success", **result}
    except Exception as e:
        print(f"[etl/sync] ❌ error={e}", flush=True)
        return {"status": "error", "error": str(e)}


# ─────────────────────────────────────────────
# Fix Plan read endpoints (for dashboard)
# ─────────────────────────────────────────────

@app.get("/api/fix-plans")
def list_fix_plans(
    limit: int = 50,
    page_type: Optional[str] = None,
    device_type: Optional[str] = None,
    patch_status: Optional[str] = None,
):
    """
    List fix plans for the dashboard.
    Optional query params: page_type, device_type, patch_status, limit.
    Example: GET /api/fix-plans?page_type=product&device_type=mobile
    """
    try:
        plans = get_fix_plans_list(
            limit=limit,
            page_type=page_type,
            device_type=device_type,
            patch_status=patch_status,
        )
        for p in plans:
            if p.get("created_at"):
                p["created_at"] = p["created_at"].isoformat()
            if p.get("updated_at"):
                p["updated_at"] = p["updated_at"].isoformat()
            if p.get("patch_status") == "pushed":
                p["fix_branch"] = f"fix/ai-patch-{p['id']}"
        return {"fix_plans": plans, "total": len(plans)}
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/fix-plans/{fix_plan_id}")
def get_fix_plan_detail(fix_plan_id: int):
    """
    Get one fix plan with full detail: metrics, patch diff, audit history.
    Used by dashboard to show before/after and what the AI changed.
    """
    try:
        plan = get_fix_plan_by_id(fix_plan_id)
        if not plan:
            return {"error": f"fix_plan_id={fix_plan_id} not found"}

        changes = get_fix_plan_changes(fix_plan_id, only_pending=False)

        for key in ("created_at", "updated_at"):
            if plan.get(key):
                plan[key] = plan[key].isoformat()

        if plan.get("patch_status") == "pushed":
            plan["fix_branch"] = f"fix/ai-patch-{fix_plan_id}"

        plan["changes"] = [
            {
                "target_file": c["target_file"],
                "original_code": c["original_code"],
                "suggested_code": c["suggested_code"],
                "change_type": c["change_type"],
                "change_reason": c["change_reason"],
                "apply_status": c["apply_status"],
            }
            for c in changes
        ]

        return plan
    except Exception as e:
        return {"error": str(e)}


    # Compatibility endpoint for older manual tests.
    @app.post("/trigger")
    def trigger(
        payload: TriggerPayload,
        x_luminara_secret: Optional[str] = Header(default=None),
    ):
        return trigger_agent(
            payload=payload,
            x_luminara_secret=x_luminara_secret,
        )