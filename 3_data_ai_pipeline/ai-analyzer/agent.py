import os
import re
import json
import uuid
import argparse
from pathlib import Path
from statistics import median
from typing import TypedDict, Optional, Any

import psycopg2
import requests
import httpx
from psycopg2.extras import Json
from dotenv import load_dotenv
from openai import OpenAI
from langgraph.graph import StateGraph, END

from ra_runtime.git_workspace import prepare_workspace
from ra_runtime.source_context import collect_source_context
from ra_runtime.patch_generator import generate_patch_from_source

load_dotenv()

# ─────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────

QWEN_MODEL = os.getenv(
    "QWEN_MODEL",
    "/abr/coss41/shared_workspace/yuyu_workspace/data/models/qwen32b-int4",
)

QWEN_BASE_URL = os.getenv(
    "QWEN_BASE_URL",
    "http://DIS02:8000/v1",
)

RAG_SERVICE_URL = os.getenv(
    "RAG_SERVICE_URL",
    "http://localhost:9020",
)

# Staged self-healing: fix top 1 first by default
MAX_OPPORTUNITIES = int(os.getenv("MAX_OPPORTUNITIES", "3"))

client = OpenAI(
    base_url=QWEN_BASE_URL,
    api_key=os.getenv("QWEN_API_KEY", "dummy"),
    http_client=httpx.Client(
        trust_env=False,
        timeout=300.0,
    ),
)


def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("HOST_IP"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )


# ─────────────────────────────────────────────
# LHCI helpers (read directly from lhci DB)
# ─────────────────────────────────────────────

def url_to_page_type(url: str) -> str:
    from urllib.parse import urlparse
    path = urlparse(url).path.rstrip("/")
    if not path:
        return "main"
    parts = [p for p in path.split("/") if p]
    return parts[0] if parts else "main"


def get_device_type_from_lhr(lhr: dict) -> str:
    config = lhr.get("configSettings", {})
    form_factor = config.get("formFactor") or config.get("emulatedFormFactor", "mobile")
    return "mobile" if str(form_factor).lower() == "mobile" else "desktop"


def get_lhci_runs_for_group(lhci_cursor, lhci_build_id: str, page_type: str, device_type: str) -> list:
    """
    Fetch all LHCI runs for a build, filter by page_type (from URL) and device_type (from LHR).
    Returns list of dicts with keys: run_id, url, lhr, page_type, device_type.
    """
    lhci_cursor.execute(
        'SELECT id, url, lhr FROM runs WHERE "buildId" = %s::uuid ORDER BY "createdAt"',
        (lhci_build_id,),
    )
    rows = lhci_cursor.fetchall()
    print(f"  [lhci_runs] build={lhci_build_id[:8]} total_rows={len(rows)} page={page_type} device={device_type}", flush=True)

    result = []
    for run_id, url, lhr_text in rows:
        pt = url_to_page_type(url)
        if pt != page_type:
            continue
        lhr = json.loads(lhr_text) if isinstance(lhr_text, str) else lhr_text
        dt = get_device_type_from_lhr(lhr)
        if dt != device_type:
            continue
        result.append({
            "run_id": str(run_id),
            "url": url,
            "lhr": lhr,
            "page_type": pt,
            "device_type": dt,
        })

    return result


def get_stable_opportunities_from_lhci(lhci_runs: list, max_opportunities: int) -> list:
    """
    Parse Lighthouse opportunities from in-memory LHR dicts (no DB needed).
    Equivalent to get_stable_opportunities() but for LHCI data.
    """
    from ra_runtime.audit_ingestion import parse_opportunities

    grouped: dict = {}

    for run_index, run in enumerate(lhci_runs[:3]):
        opps = parse_opportunities(run["lhr"], test_id=run_index + 1)
        for opp in opps:
            key = opp.get("opportunity_id") or opp.get("title")
            if not key:
                continue
            if key not in grouped:
                grouped[key] = {
                    "ids": [],
                    "test_ids": set(),
                    "opportunity_id": opp.get("opportunity_id"),
                    "title": opp.get("title", ""),
                    "description": opp.get("description", ""),
                    "savings_values": [],
                    "severity_values": [],
                    "category": opp.get("category", "performance"),
                }
            grouped[key]["ids"].append(opp.get("opportunity_id") or key)
            grouped[key]["test_ids"].add(run_index + 1)
            if opp.get("savings_ms"):
                grouped[key]["savings_values"].append(int(opp["savings_ms"]))
            grouped[key]["severity_values"].append(normalize_severity(opp.get("severity")))

    opportunities = []
    for item in grouped.values():
        frequency = len(item["test_ids"])
        if frequency < 2:
            continue
        avg_savings = int(sum(item["savings_values"]) / max(len(item["savings_values"]), 1)) if item["savings_values"] else 0
        severity = sorted(item["severity_values"], key=severity_rank, reverse=True)[0]
        affected_metric = infer_affected_metric(item["title"], item["category"])
        priority_level = priority_from_savings(avg_savings, severity)

        opportunities.append({
            "id": item["ids"][0] if item["ids"] else item["opportunity_id"],
            "opportunity_id": item["opportunity_id"],
            "title": item["title"],
            "description": item["description"],
            "avg_savings_ms": avg_savings,
            "severity": severity,
            "category": item["category"],
            "frequency": frequency,
            "supporting_test_ids": sorted(list(item["test_ids"])),
            "affected_metric": affected_metric,
            "priority_level": priority_level,
        })

    opportunities.sort(
        key=lambda opp: (opp["frequency"], opp["avg_savings_ms"], severity_rank(opp["severity"])),
        reverse=True,
    )
    return opportunities[:max_opportunities]


class AgentState(TypedDict, total=False):
    test_id: int

    # Trigger mode:
    # - "test_id": listener provides one test_id, agent resolves sibling 3 runs.
    # - "audit_group": listener provides playwright_run_id + page/device group.
    mode: Optional[str]

    # 3-run audit group identity.
    playwright_run_id: Optional[int]
    lhci_build_id: Optional[str]
    site_type: Optional[str]
    network_profile: Optional[str]

    url: str
    page_type: str
    device_type: str

    # Stable 3-run group metadata.
    supporting_test_ids: list
    representative_test_id: Optional[int]
    group_key: Optional[str]
    run_frequency: int

    pr_branch: Optional[str]
    target_dir: Optional[str]
    thread_id: Optional[str]

    dry_run: bool
    max_opportunities: int

    metrics: dict
    opportunities: list
    confidence: str

    current_opp: dict
    opp_index: int

    rag_context: str
    rag_evidence: list
    generated_patch_signatures: list

    risk_score: int
    risk_details: dict

    # Source-aware patch generation state.
    # source_context.py stores actual source snippets here.
    source_context: dict

    # patch_generator.py stores validated patch output here.
    patch_result: dict

    # Agent_Workspace paths created by git_workspace.py.
    workspace_path: Optional[str]
    repo_path: Optional[str]

    fix_recommendation: dict
    fix_plan_id: Optional[int]
    fix_plan_ids: list

    should_end: bool
# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def normalize_severity(severity: Optional[str]) -> str:
    severity = (severity or "").lower()
    return severity if severity in {"high", "medium", "low"} else "medium"


def priority_from_savings(avg_savings_ms: int, severity: Optional[str]) -> str:
    severity = normalize_severity(severity)

    if severity == "high" or avg_savings_ms >= 500:
        return "high"
    if severity == "medium" or avg_savings_ms >= 150:
        return "medium"
    return "low"


def infer_affected_metric(title: str, category: str) -> str:
    text = f"{title} {category}".lower()

    if "lcp" in text or "largest contentful paint" in text or "image" in text:
        return "LCP"
    if "tbt" in text or "javascript" in text or "js" in text or "main thread" in text:
        return "TBT"
    if "cls" in text or "layout shift" in text:
        return "CLS"
    if "fcp" in text or "render-blocking" in text or "css" in text:
        return "FCP"
    if "ttfb" in text or "server response" in text:
        return "TTFB"

    return "Performance"


def build_patch_template(title: str, category: str) -> dict:
    text = f"{title} {category}".lower()

    if "server response" in text or "ttfb" in text:
        return {
            "summary": "Improve server response time using caching and backend optimization.",
            "target_file": "server/cache-config or backend route handler",
            "change_type": "server_config",
            "before": "No explicit cache policy or slow backend response path.",
            "after": "Add CDN/server caching, optimize backend query, and reduce TTFB.",
        }

    if "unused javascript" in text or "legacy javascript" in text or "javascript" in text or "js" in text:
        return {
            "summary": "Reduce JavaScript payload using code splitting and modern bundle output.",
            "target_file": "next.config.js / package build config / page component imports",
            "change_type": "javascript_optimization",
            "before": "Large JavaScript bundle loaded for initial route.",
            "after": "Split non-critical modules with dynamic import and avoid unnecessary legacy transpilation.",
        }

    if "css" in text or "render-blocking" in text:
        return {
            "summary": "Reduce render-blocking CSS and remove unused styles.",
            "target_file": "global CSS / component CSS / build CSS pipeline",
            "change_type": "css_optimization",
            "before": "Large CSS loaded before first render.",
            "after": "Inline critical CSS, defer non-critical CSS, and remove unused CSS rules.",
        }

    if "image" in text or "next-gen" in text or "properly size" in text or "offscreen" in text:
        return {
            "summary": "Optimize images using responsive sizes, lazy loading, and WebP/AVIF.",
            "target_file": "image component / product card / hero section",
            "change_type": "image_optimization",
            "before": '<img src="hero.jpg" />',
            "after": '<img src="hero.webp" loading="eager" fetchpriority="high" width="..." height="..." />',
        }

    if "compression" in text:
        return {
            "summary": "Enable Brotli/Gzip compression for text assets.",
            "target_file": "web server config / CDN config",
            "change_type": "network_optimization",
            "before": "Text resources served without compression.",
            "after": "Enable br/gzip compression for JS, CSS, HTML, JSON, and SVG resources.",
        }

    return {
        "summary": "Apply Lighthouse recommended performance optimization.",
        "target_file": "target source/config file",
        "change_type": "performance_optimization",
        "before": None,
        "after": "Apply recommended optimization and verify with Lighthouse rerun.",
    }


def get_existing_columns(cursor, table_name: str) -> set:
    cursor.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = %s
        """,
        (table_name,),
    )
    return {row[0] for row in cursor.fetchall()}


def db_value(value: Any):
    if isinstance(value, (dict, list)):
        return Json(value)
    return value


def safe_insert(cursor, table_name: str, data: dict, returning: str = "id"):
    existing_cols = get_existing_columns(cursor, table_name)
    filtered = {k: v for k, v in data.items() if k in existing_cols}

    if not filtered:
        raise ValueError(f"No matching columns found for table {table_name}")

    columns = list(filtered.keys())
    placeholders = ["%s"] * len(columns)
    values = [db_value(filtered[col]) for col in columns]

    sql = f"""
        INSERT INTO {table_name} ({", ".join(columns)})
        VALUES ({", ".join(placeholders)})
        RETURNING {returning}
    """

    cursor.execute(sql, values)
    return cursor.fetchone()[0]


def extract_json(raw_text: str) -> dict:
    raw_text = raw_text.strip()

    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.strip()

    try:
        return json.loads(raw_text)
    except Exception:
        match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))



def normalize_auto_patch_fix(fix_rec: dict) -> dict:
    """
    Normalize Qwen output for realistic RA patch application.

    Realistic rule:
    - If exact file-level patches exist, keep them.
    - If patch is vague/summary-only/server-config-only, mark as manual review.
    """
    patches = fix_rec.get("patches", [])

    if not isinstance(patches, list):
        patches = []

    valid_patches = []

    vague_targets = {
        "unknown",
        "target source/config file",
        "server configuration files",
        "server configuration files (e.g., redis configuration file)",
        "server/cache-config or backend route handler",
        "image component / product card / hero section",
        "global css / component css / build css pipeline",
        "next.config.js / package build config / page component imports",
        "web server config / cdn config",
        "likely file/config area",
    }

    for patch in patches:
        if not isinstance(patch, dict):
            continue

        target_file = (patch.get("target_file") or "").strip()
        original_code = patch.get("original_code")
        suggested_code = patch.get("suggested_code")

        if not target_file:
            continue

        if target_file.lower() in vague_targets:
            continue

        if not original_code or not suggested_code:
            continue

        valid_patches.append({
            "target_file": target_file,
            "original_code": original_code,
            "suggested_code": suggested_code,
            "change_type": patch.get("change_type", "code_replace"),
            "change_reason": patch.get(
                "change_reason",
                fix_rec.get("reasoning", "")
            ),
        })

    fix_rec["patches"] = valid_patches

    if valid_patches:
        fix_rec["auto_applicable"] = True
        fix_rec.setdefault("manual_review_reason", None)
    else:
        fix_rec["auto_applicable"] = False
        fix_rec["patches"] = []
        fix_rec["manual_review_reason"] = fix_rec.get(
            "manual_review_reason"
        ) or (
            "No exact file-level patch was generated. "
            "The recommendation is useful for review, but it cannot be safely "
            "auto-applied until target_file, original_code, and suggested_code "
            "are available."
        )

    return fix_rec

def is_failed_run(row: dict) -> bool:
    """
    Return True if one Lighthouse run fails any main performance threshold.
    """
    return (
        (row.get("performance_score") is not None and row["performance_score"] < 90)
        or (row.get("lcp_ms") is not None and row["lcp_ms"] > 2500)
        or (row.get("tbt_ms") is not None and row["tbt_ms"] > 200)
        or (row.get("cls_score") is not None and row["cls_score"] > 0.1)
        or (row.get("inp_ms") is not None and row["inp_ms"] > 200)
    )


def median_or_none(values):
    """
    Median is safer than average for Lighthouse repeated runs.
    One noisy run will not distort the group metric too much.
    """
    clean = [float(v) for v in values if v is not None]

    if not clean:
        return None

    return round(float(median(clean)), 2)


def median_cls_or_none(values):
    """
    CLS needs 4 decimal places.
    """
    clean = [float(v) for v in values if v is not None]

    if not clean:
        return None

    return round(float(median(clean)), 4)


def severity_rank(severity: Optional[str]) -> int:
    """
    Convert severity text to rank for sorting.
    """
    severity = normalize_severity(severity)

    if severity == "high":
        return 3

    if severity == "medium":
        return 2

    return 1


def rows_to_run_dicts(rows) -> list:
    """
    Convert lighthouse_runs SQL rows into dicts.
    Used by both test_id mode and audit_group mode.
    """
    result = []

    for row in rows:
        (
            test_id,
            playwright_run_id,
            url,
            site_type,
            page_type,
            device_type,
            network_profile,
            run_number,
            lcp_ms,
            tbt_ms,
            cls_score,
            performance_score,
            fcp_ms,
            si_ms,
            tti_ms,
            ttfb_ms,
            inp_ms,
        ) = row

        result.append({
            "test_id": test_id,
            "playwright_run_id": playwright_run_id,
            "url": url,
            "site_type": site_type,
            "page_type": page_type,
            "device_type": device_type,
            "network_profile": network_profile,
            "run_number": run_number,
            "lcp_ms": lcp_ms,
            "tbt_ms": tbt_ms,
            "cls_score": cls_score,
            "performance_score": performance_score,
            "fcp_ms": fcp_ms,
            "si_ms": si_ms,
            "tti_ms": tti_ms,
            "ttfb_ms": ttfb_ms,
            "inp_ms": inp_ms,
        })

    return result


def get_group_runs_from_test_id(cursor, test_id: int) -> list:
    """
    Transitional mode.

    Input:
    - one test_id

    Behavior:
    - find that run's playwright_run_id + site/page/device
    - find sibling runs from the same group
    """
    cursor.execute(
        """
        SELECT
            test_id,
            playwright_run_id,
            url,
            site_type,
            page_type,
            device_type,
            network_profile,
            run_number,
            lcp_ms,
            tbt_ms,
            cls_score,
            performance_score,
            fcp_ms,
            si_ms,
            tti_ms,
            ttfb_ms,
            inp_ms
        FROM lighthouse_runs
        WHERE test_id = %s
        """,
        (test_id,),
    )

    base = cursor.fetchone()

    if not base:
        return []

    (
        base_test_id,
        playwright_run_id,
        url,
        site_type,
        page_type,
        device_type,
        network_profile,
        run_number,
        lcp_ms,
        tbt_ms,
        cls_score,
        performance_score,
        fcp_ms,
        si_ms,
        tti_ms,
        ttfb_ms,
        inp_ms,
    ) = base

    cursor.execute(
        """
        SELECT
            test_id,
            playwright_run_id,
            url,
            site_type,
            page_type,
            device_type,
            network_profile,
            run_number,
            lcp_ms,
            tbt_ms,
            cls_score,
            performance_score,
            fcp_ms,
            si_ms,
            tti_ms,
            ttfb_ms,
            inp_ms
        FROM lighthouse_runs
        WHERE playwright_run_id = %s
          AND site_type = %s
          AND page_type = %s
          AND device_type = %s
        ORDER BY run_number ASC, test_id ASC
        """,
        (playwright_run_id, site_type, page_type, device_type),
    )

    return rows_to_run_dicts(cursor.fetchall())


def get_group_runs_from_audit_group(
    cursor,
    playwright_run_id,
    site_type: str,
    page_type: str,
    device_type: str,
) -> list:
    """
    Production mode — find runs by exact playwright_run_id.
    playwright_run_id must be castable to int (DB column is INTEGER).
    Returns [] immediately if the value is a non-numeric string like 'pw_12345'.
    """
    try:
        int(playwright_run_id)
    except (TypeError, ValueError):
        return []

    cursor.execute(
        """
        SELECT
            test_id,
            playwright_run_id,
            url,
            site_type,
            page_type,
            device_type,
            network_profile,
            run_number,
            lcp_ms,
            tbt_ms,
            cls_score,
            performance_score,
            fcp_ms,
            si_ms,
            tti_ms,
            ttfb_ms,
            inp_ms
        FROM lighthouse_runs
        WHERE playwright_run_id = %s
          AND site_type = %s
          AND page_type = %s
          AND device_type = %s
        ORDER BY run_number ASC, test_id ASC
        """,
        (playwright_run_id, site_type, page_type, device_type),
    )

    return rows_to_run_dicts(cursor.fetchall())


def get_latest_stable_group_runs(
    cursor,
    site_type: str,
    page_type: str,
    device_type: str,
) -> list:
    """
    Fallback for production triggers where playwright_run_id from GHA
    does not match any row in the DB (e.g. 'pw_<github_run_id>' format).

    Finds the most recent playwright_run_id that has at least 3 runs
    for the given site/page/device combination, then returns those runs.
    """
    cursor.execute(
        """
        SELECT playwright_run_id
        FROM lighthouse_runs
        WHERE site_type = %s
          AND page_type = %s
          AND device_type = %s
        GROUP BY playwright_run_id
        HAVING COUNT(*) >= 3
        ORDER BY MAX(created_at) DESC
        LIMIT 1
        """,
        (site_type, page_type, device_type),
    )
    row = cursor.fetchone()
    if not row:
        return []

    latest_run_id = row[0]
    return get_group_runs_from_audit_group(
        cursor, latest_run_id, site_type, page_type, device_type
    )


def get_any_runs_for_group(
    cursor,
    site_type: str,
    page_type: str,
    device_type: str,
) -> list:
    """
    Last-resort fallback: find any runs for this page/device, even fewer than 3.
    Uses the most recent playwright_run_id with at least 1 run.
    """
    cursor.execute(
        """
        SELECT playwright_run_id
        FROM lighthouse_runs
        WHERE site_type = %s
          AND page_type = %s
          AND device_type = %s
        GROUP BY playwright_run_id
        ORDER BY MAX(created_at) DESC
        LIMIT 1
        """,
        (site_type, page_type, device_type),
    )
    row = cursor.fetchone()
    if not row:
        return []

    latest_run_id = row[0]
    return get_group_runs_from_audit_group(
        cursor, latest_run_id, site_type, page_type, device_type
    )


def choose_representative_test_id(group_runs: list) -> int:
    """
    Choose one representative test_id for fix_plans.test_id.

    Rule:
    - worst performance_score first
    - if tie, highest LCP
    """
    sorted_runs = sorted(
        group_runs,
        key=lambda r: (
            r.get("performance_score") if r.get("performance_score") is not None else 999,
            -(r.get("lcp_ms") or 0),
        ),
    )

    return sorted_runs[0]["test_id"]


def aggregate_failed_metrics(group_runs: list) -> tuple[list, dict]:
    """
    Stable failed metric = failed in at least 2 of 3 runs.
    """
    counts = {
        "performance_score": 0,
        "LCP": 0,
        "TBT": 0,
        "CLS": 0,
        "INP": 0,
    }

    for row in group_runs:
        if row.get("performance_score") is not None and row["performance_score"] < 90:
            counts["performance_score"] += 1

        if row.get("lcp_ms") is not None and row["lcp_ms"] > 2500:
            counts["LCP"] += 1

        if row.get("tbt_ms") is not None and row["tbt_ms"] > 200:
            counts["TBT"] += 1

        if row.get("cls_score") is not None and row["cls_score"] > 0.1:
            counts["CLS"] += 1

        if row.get("inp_ms") is not None and row["inp_ms"] > 200:
            counts["INP"] += 1

    stable_failed = [
        metric
        for metric, count in counts.items()
        if count >= 2
    ]

    return stable_failed, counts


def confidence_from_group(group_runs: list) -> str:
    """
    Confidence based on how many runs failed.
    """
    failed_count = sum(1 for row in group_runs if is_failed_run(row))

    if failed_count >= 3:
        return "high"

    if failed_count == 2:
        return "medium"

    return "low"



# ─────────────────────────────────────────────
# N1 — Get metrics + rank opportunities
# ─────────────────────────────────────────────

def get_metrics(state: AgentState) -> AgentState:
    print("\n[N1] Getting 3-run stable metrics and opportunities...")

    mode = state.get("mode") or "test_id"
    test_id = state.get("test_id")
    max_opportunities = state.get("max_opportunities", MAX_OPPORTUNITIES)
    lhci_build_id = state.get("lhci_build_id")

    conn = get_db_connection()
    cursor = conn.cursor()

    lhci_runs_cache = None  # used by LHCI path for opportunity parsing

    try:
        if mode == "audit_group":
            site_type = state.get("site_type") or "decathlon"
            page_type = state.get("page_type")
            device_type = state.get("device_type")

            if not page_type or not device_type:
                print("  ❌ audit_group mode requires page_type and device_type")
                return {**state, "should_end": True}

            group_runs = []

            if lhci_build_id:
                # ── LHCI path: read directly from lhci DB ─────────────────
                print(f"  → LHCI path: build_id={lhci_build_id[:8]}... page={page_type} device={device_type}")
                from ra_runtime.db_client import get_lhci_connection
                from ra_runtime.audit_ingestion import parse_metrics as parse_lhci_metrics

                lhci_conn = get_lhci_connection()
                lhci_cursor = lhci_conn.cursor()
                try:
                    lhci_runs_cache = get_lhci_runs_for_group(
                        lhci_cursor, lhci_build_id, page_type, device_type
                    )
                finally:
                    lhci_conn.close()

                if not lhci_runs_cache:
                    print(f"  ❌ No LHCI runs found for build={lhci_build_id} page={page_type} device={device_type}")
                    return {**state, "should_end": True}

                for i, run in enumerate(lhci_runs_cache[:3], start=1):
                    m = parse_lhci_metrics(run["lhr"])
                    group_runs.append({
                        "test_id": i,
                        "playwright_run_id": lhci_build_id,
                        "url": run["url"],
                        "site_type": site_type,
                        "page_type": run["page_type"],
                        "device_type": run["device_type"],
                        "network_profile": None,
                        "run_number": i,
                        "lcp_ms": m.get("lcp_ms"),
                        "tbt_ms": m.get("tbt_ms"),
                        "cls_score": m.get("cls_score"),
                        "performance_score": m.get("performance_score"),
                        "fcp_ms": m.get("fcp_ms"),
                        "si_ms": m.get("si_ms"),
                        "tti_ms": m.get("tti_ms"),
                        "ttfb_ms": m.get("ttfb_ms"),
                        "inp_ms": m.get("inp_ms"),
                    })

            else:
                # ── core_db path (legacy / test_id mode fallback) ──────────
                playwright_run_id = state.get("playwright_run_id")

                if playwright_run_id:
                    group_runs = get_group_runs_from_audit_group(
                        cursor=cursor,
                        playwright_run_id=playwright_run_id,
                        site_type=site_type,
                        page_type=page_type,
                        device_type=device_type,
                    )

                if not group_runs:
                    print(
                        f"  ⚠️  playwright_run_id={playwright_run_id!r} not found in DB. "
                        f"Falling back to latest stable group for "
                        f"{site_type}/{page_type}/{device_type}..."
                    )
                    group_runs = get_latest_stable_group_runs(
                        cursor=cursor,
                        site_type=site_type,
                        page_type=page_type,
                        device_type=device_type,
                    )

                if not group_runs:
                    print(
                        f"  ⚠️  No stable 3-run group found. "
                        f"Using any available runs for {site_type}/{page_type}/{device_type}..."
                    )
                    group_runs = get_any_runs_for_group(
                        cursor=cursor,
                        site_type=site_type,
                        page_type=page_type,
                        device_type=device_type,
                    )

        else:
            if not test_id:
                print("  ❌ test_id is required in test_id mode.")
                return {**state, "should_end": True}

            group_runs = get_group_runs_from_test_id(
                cursor=cursor,
                test_id=test_id,
            )

        if len(group_runs) < 1:
            print(f"  ❌ No runs found for this page/device combination.")
            return {
                **state,
                "should_end": True,
                "confidence": "low",
            }

        if len(group_runs) < 3:
            print(f"  ⚠️  Only {len(group_runs)} run(s) found — proceeding with reduced confidence.")

        group_runs = group_runs[:3]

        supporting_test_ids = [row["test_id"] for row in group_runs]
        representative_test_id = choose_representative_test_id(group_runs)

        first = group_runs[0]
        playwright_run_id = first["playwright_run_id"]
        site_type = first["site_type"]
        page_type = first["page_type"]
        device_type = first["device_type"]
        url = first["url"]
        network_profile = first.get("network_profile")

        confidence = confidence_from_group(group_runs)

        if confidence == "low":
            print("  ❌ Only 0/1 failed runs in the 3-run group. Agent stops.")
            return {
                **state,
                "should_end": True,
                "confidence": confidence,
            }

        failed_metrics, failed_metric_counts = aggregate_failed_metrics(group_runs)

        if not failed_metrics:
            print("  ✅ No stable failed metric across 3 runs. Agent stops.")
            return {
                **state,
                "should_end": True,
                "confidence": confidence,
            }

        metrics = {
            "test_ids": supporting_test_ids,
            "representative_test_id": representative_test_id,
            "run_count": len(group_runs),
            "avg_lcp_ms": median_or_none([r.get("lcp_ms") for r in group_runs]),
            "avg_tbt_ms": median_or_none([r.get("tbt_ms") for r in group_runs]),
            "avg_cls_score": median_cls_or_none([r.get("cls_score") for r in group_runs]),
            "avg_performance": median_or_none([r.get("performance_score") for r in group_runs]),
            "fcp_ms": median_or_none([r.get("fcp_ms") for r in group_runs]),
            "si_ms": median_or_none([r.get("si_ms") for r in group_runs]),
            "tti_ms": median_or_none([r.get("tti_ms") for r in group_runs]),
            "ttfb_ms": median_or_none([r.get("ttfb_ms") for r in group_runs]),
            "inp_ms": median_or_none([r.get("inp_ms") for r in group_runs]),
            "failed_metrics": failed_metrics,
            "failed_metric_counts": failed_metric_counts,
        }

        opportunities = get_stable_opportunities_from_lhci(
            lhci_runs_cache[:3], max_opportunities
        )

        if not opportunities:
            print("  ❌ No stable opportunities found across 3 runs.")
            return {
                **state,
                "should_end": True,
                "confidence": confidence,
            }

        group_key = f"{playwright_run_id}_{site_type}_{page_type}_{device_type}"

        print(f"  ✅ mode: {mode}")
        print(f"  ✅ lhci_build_id: {lhci_build_id or 'N/A'}")
        print(f"  ✅ playwright_run_id: {playwright_run_id}")
        print(f"  ✅ group_key: {group_key}")
        print(f"  ✅ supporting_test_ids: {supporting_test_ids}")
        print(f"  ✅ representative_test_id: {representative_test_id}")
        print(f"  ✅ URL: {url}")
        print(f"  ✅ Page: {page_type}")
        print(f"  ✅ Device: {device_type}")
        print(f"  ✅ Confidence: {confidence}")
        print(f"  ✅ Stable failed metrics: {failed_metrics}")
        print(f"  ✅ Stable opportunities selected: {len(opportunities)}")

        for opp in opportunities:
            print(
                f"     - {opp['title']} | "
                f"freq={opp['frequency']}/3 | "
                f"{opp['avg_savings_ms']}ms | "
                f"{opp['priority_level']} | "
                f"{opp['affected_metric']}"
            )

        return {
            **state,
            "mode": mode,
            "test_id": None if lhci_build_id else representative_test_id,
            "representative_test_id": representative_test_id,
            "supporting_test_ids": supporting_test_ids,
            "playwright_run_id": playwright_run_id,
            "lhci_build_id": lhci_build_id,
            "site_type": site_type,
            "page_type": page_type,
            "device_type": device_type,
            "network_profile": network_profile,
            "url": url,
            "group_key": group_key,
            "run_frequency": len(group_runs),
            "metrics": metrics,
            "opportunities": opportunities,
            "confidence": confidence,
            "opp_index": 0,
            "fix_plan_ids": state.get("fix_plan_ids", []),
            "should_end": False,
        }

    finally:
        conn.close()
# ─────────────────────────────────────────────
# N2 — Pick priority opportunity
# ─────────────────────────────────────────────

def pick_opportunity(state: AgentState) -> AgentState:
    print("\n[N2] Picking highest-priority opportunity...")

    opportunities = state.get("opportunities", [])
    opp_index = state.get("opp_index", 0)

    if opp_index >= len(opportunities):
        print("  ✅ All selected opportunities processed")
        return {**state, "should_end": True}

    current_opp = opportunities[opp_index]

    print(
        f"  ✅ [{opp_index + 1}/{len(opportunities)}] "
        f"{current_opp['title']} | "
        f"{current_opp['avg_savings_ms']}ms | "
        f"{current_opp['priority_level']} | "
        f"{current_opp['affected_metric']}"
    )

    return {**state, "current_opp": current_opp}


# ─────────────────────────────────────────────
# N3 — Search RAG through rag_service
# ─────────────────────────────────────────────

def search_rag(state: AgentState) -> AgentState:
    print("\n[N3] Searching RAG through rag_service...")

    opp = state["current_opp"]

    q1 = f"How to fix {opp['title']} for {opp['affected_metric']}"

    q2 = (
        f"{opp['title']} {state.get('page_type')} page "
        f"{state.get('device_type')} Korean e-commerce "
        f"competitor benchmark Core Web Vitals"
    )

    rag_evidence = []

    try:
        docs = []
        seen_titles = set()

        for query in [q1, q2]:
            response = requests.post(
                f"{RAG_SERVICE_URL}/search",
                json={
                    "query": query,
                    "top_k": 3,
                },
                timeout=120,
            )

            data = response.json()

            if response.status_code != 200 or data.get("status") != "success":
                raise RuntimeError(data)

            for doc in data.get("results", []):
                title = doc.get("title")

                if title in seen_titles:
                    continue

                seen_titles.add(title)
                docs.append(doc)

        formatted = []

        for i, doc in enumerate(docs[:5], 1):
            similarity = round(float(doc.get("similarity", 0)), 4)

            rag_evidence.append({
                "title": doc.get("title"),
                "doc_type": doc.get("doc_type"),
                "source": doc.get("source"),
                "similarity": similarity,
            })

            formatted.append(
                f"[Doc {i}] {doc.get('title')}\n"
                f"Type: {doc.get('doc_type')}\n"
                f"Similarity: {similarity}\n"
                f"{doc.get('content')}"
            )

        rag_context = "\n\n".join(formatted)

        print(f"  ✅ RAG docs selected: {len(docs[:5])}")

    except Exception as e:
        print(f"  ⚠️ RAG service search failed: {e}")
        rag_context = ""
        rag_evidence = []

    return {
        **state,
        "rag_context": rag_context,
        "rag_evidence": rag_evidence,
    }
# ─────────────────────────────────────────────
# N4 — Assess risk
# ─────────────────────────────────────────────

def assess_risk(state: AgentState) -> AgentState:
    print("\n[N4] Assessing fix risk...")

    opp = state["current_opp"]

    title = (opp.get("title") or "").lower()
    category = (opp.get("category") or "").lower()
    severity = normalize_severity(opp.get("severity"))

    risk_score = 0
    risk_details = {}

    if "server" in category or "server response" in title:
        risk_score += 4
        risk_details["category"] = "server/backend config change (+4)"
    elif "js" in category or "javascript" in title:
        risk_score += 2
        risk_details["category"] = "javascript bundle change (+2)"
    elif "css" in category or "css" in title:
        risk_score += 1
        risk_details["category"] = "css change (+1)"
    elif "image" in category or "image" in title:
        risk_score += 1
        risk_details["category"] = "image optimization change (+1)"
    else:
        risk_score += 1
        risk_details["category"] = f"{category or 'other'} (+1)"

    if severity == "high":
        risk_score += 2
        risk_details["severity"] = "high opportunity severity (+2)"
    elif severity == "medium":
        risk_score += 1
        risk_details["severity"] = "medium opportunity severity (+1)"

    risk_details["failed_metrics"] = state["metrics"].get("failed_metrics", [])

    # 3-run stable group metadata for dashboard traceability.
    risk_details["group_key"] = state.get("group_key")
    risk_details["playwright_run_id"] = state.get("playwright_run_id")
    risk_details["supporting_test_ids"] = state.get("supporting_test_ids", [])
    risk_details["representative_test_id"] = state.get("representative_test_id")
    risk_details["run_frequency"] = state.get("run_frequency", 1)
    risk_details["failed_metric_counts"] = state.get("metrics", {}).get(
        "failed_metric_counts",
        {},
    )

    # Queue metadata.
    risk_details["queue_rank"] = state.get("opp_index", 0) + 1
    risk_details["total_queue_items"] = len(state.get("opportunities", []))
    risk_details["aggregation_method"] = "3-run stable group"

    risk_details["staged_self_healing"] = (
        "This Fix Plan is part of a ranked queue. "
        "Apply one patch, re-run build and Lighthouse, then move to the next queued item."
    )

    risk_score = min(risk_score, 10)

    print(f"  ✅ Risk score: {risk_score}/10")

    return {
        **state,
        "risk_score": risk_score,
        "risk_details": risk_details,
    }


# ─────────────────────────────────────────────
# N5 — Generate Fix Plan
# ─────────────────────────────────────────────

def generate_fix(state: AgentState) -> AgentState:
    print("\n[N5] Generating text-level Fix Plan with Qwen...")

    opp = state["current_opp"]
    metrics = state["metrics"]
    rag_context = state.get("rag_context", "")

    prompt = f"""
You are a senior web performance optimization engineer for Korean e-commerce.

Generate ONE staged self-healing Fix Plan.
Important rule:
- Do NOT suggest fixing every issue at once.
- Only explain the selected highest-priority opportunity.
- Do NOT generate code patches in this step.
- A separate source-aware patch generator will inspect the actual repository source code later.
- After a patch is approved/applied, the system will re-run Lighthouse and compare before/after scores.

Target audit:
- test_id: {state.get("test_id")}
- URL: {state.get("url")}
- Page type: {state.get("page_type")}
- Device: {state.get("device_type")}
- playwright_run_id: {state.get("playwright_run_id")}
- group_key: {state.get("group_key")}
- supporting_test_ids: {state.get("supporting_test_ids")}

Current failed metrics:
{json.dumps(metrics.get("failed_metrics", []), indent=2)}

Current median metrics from stable 3-run group:
- Performance score: {metrics.get("avg_performance")}
- LCP: {metrics.get("avg_lcp_ms")}ms
- TBT: {metrics.get("avg_tbt_ms")}ms
- CLS: {metrics.get("avg_cls_score")}
- INP: {metrics.get("inp_ms")}ms
- TTFB: {metrics.get("ttfb_ms")}ms

Selected priority opportunity:
- Lighthouse opportunity id: {opp.get("opportunity_id")}
- Title: {opp.get("title")}
- Description: {opp.get("description")}
- Estimated savings: {opp.get("avg_savings_ms")}ms
- Severity: {opp.get("severity")}
- Category: {opp.get("category")}
- Affected metric: {opp.get("affected_metric")}
- Priority: {opp.get("priority_level")}

Risk:
- Risk score: {state.get("risk_score")}/10
- Risk details: {json.dumps(state.get("risk_details", {}), ensure_ascii=False)}

RAG context:
{rag_context}

Return ONLY valid JSON:
{{
  "action": "specific one-sentence fix action",
  "reasoning": "why this one fix should be handled first",
  "problem_summary": "short dashboard-friendly problem summary",
  "impact_if_not_fixed": "impact if ignored",
  "impact_if_fixed": "expected improvement after this staged fix",
  "ux_improvement": "user experience benefit",
  "seo_impact": "SEO/Core Web Vitals benefit",
  "priority_level": "{opp.get("priority_level")}",
  "estimated_improvement": {opp.get("avg_savings_ms")},
  "affected_metric": "{opp.get("affected_metric")}",
  "manual_review_reason": null,
  "next_step_after_patch": "generate source-aware patch from Agent_Workspace, wait for human approval, apply patch, run build test, then rerun Lighthouse and compare new score with old_score"
}}

Rules:
- Do not output patches.
- Do not invent file paths.
- Do not exaggerate severity. If a metric is not over the project threshold, describe it as an optimization opportunity rather than a failure.
- If this opportunity likely requires server/CDN/cache/infrastructure changes, say it should be manually reviewed unless source-aware patch generation finds a safe config file.
"""

    try:
        response = client.chat.completions.create(
            model=QWEN_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=900,
            temperature=0.1,
        )

        raw = response.choices[0].message.content.strip()
        fix_rec = extract_json(raw)

        print(f"  ✅ Qwen text Fix Plan generated: {fix_rec.get('action', '')[:90]}")

    except Exception as e:
        print(f"  ⚠️ Qwen failed: {e}")
        print("  → Using fallback staged text Fix Plan")

        fix_rec = {
            "action": f"Fix {opp['title']} to improve {opp['affected_metric']}",
            "reasoning": (
                f"This is a stable opportunity across the current 3-run audit group. "
                f"It targets {opp['affected_metric']} and is estimated to save "
                f"about {opp['avg_savings_ms']}ms."
            ),
            "problem_summary": opp["title"],
            "impact_if_not_fixed": (
                f"{opp['affected_metric']} may remain weak, causing slower page load "
                "and weaker Lighthouse/Core Web Vitals performance."
            ),
            "impact_if_fixed": f"Expected improvement: about {opp['avg_savings_ms']}ms saved.",
            "ux_improvement": "Users can see and interact with the page faster.",
            "seo_impact": "Improves Lighthouse/Core Web Vitals quality signals.",
            "priority_level": opp.get("priority_level", "medium"),
            "estimated_improvement": opp["avg_savings_ms"],
            "affected_metric": opp["affected_metric"],
            "manual_review_reason": None,
            "next_step_after_patch": (
                "generate source-aware patch from Agent_Workspace, wait for human approval, "
                "apply patch, run build test, then rerun Lighthouse and compare new score with old_score"
            ),
        }

    fix_rec.setdefault("problem_summary", opp["title"])
    fix_rec.setdefault("priority_level", opp.get("priority_level", "medium"))
    fix_rec.setdefault("estimated_improvement", opp["avg_savings_ms"])
    fix_rec.setdefault("affected_metric", opp["affected_metric"])
    fix_rec.setdefault("manual_review_reason", None)
    fix_rec.setdefault(
        "next_step_after_patch",
        (
            "generate source-aware patch from Agent_Workspace, wait for human approval, "
            "apply patch, run build test, then rerun Lighthouse and compare new score with old_score"
        ),
    )

    # Source-aware patch generation happens in N5.5 only.
    # This step only creates the dashboard text-level Fix Plan.
    fix_rec["auto_applicable"] = False
    fix_rec["patches"] = []
    fix_rec["manual_review_reason"] = (
        "Waiting for source-aware patch generation from actual repository code."
    )

    return {**state, "fix_recommendation": fix_rec}
# ─────────────────────────────────────────────
# N5.5 — Generate source-aware patch
# ─────────────────────────────────────────────

def generate_source_patch(state: AgentState) -> AgentState:
    """
    Generate a real source-aware patch.

    Production behavior:
    - Reuse one Agent_Workspace per audit group instead of cloning per queue rank.
    - Let Qwen generate the exact patch from real source snippets.
    - Reject duplicate patches inside the same ranked opportunity queue.
    """
    print("\n[N5.5] Generating source-aware patch from actual code...")

    fix_rec = state.get("fix_recommendation", {})
    opp = state.get("current_opp", {})
    metrics = state.get("metrics", {})

    pr_branch = state.get("pr_branch")
    target_dir = state.get("target_dir") or "2_digital_twins/active-staging"

    if not pr_branch:
        reason = "pr_branch is missing, so Agent_Workspace source cannot be prepared."
        print(f"  ⚠️ {reason}")

        fix_rec["auto_applicable"] = False
        fix_rec["patches"] = []
        fix_rec["manual_review_reason"] = reason

        return {
            **state,
            "fix_recommendation": fix_rec,
            "patch_result": {
                "auto_applicable": False,
                "patches": [],
                "manual_review_reason": reason,
            },
        }

    # One workspace per audit group.
    # This avoids cloning the same PR branch for rank_1, rank_2, rank_3.
    workspace_key = (
        f"{state.get('thread_id') or 'manual'}_"
        f"{state.get('group_key') or 'group'}"
    )

    # Keep filesystem-safe name.
    workspace_key = re.sub(r"[^a-zA-Z0-9_.-]+", "_", workspace_key)

    # Only the first opportunity creates a clean workspace.
    # Later queued opportunities reuse the same cloned repo.
    clean_workspace = state.get("opp_index", 0) == 0

    try:
        workspace = prepare_workspace(
            fix_plan_id=workspace_key,
            pr_branch=pr_branch,
            clean=clean_workspace,
        )

        repo_path = workspace.get("repo_path")
        workspace_path = workspace.get("workspace_path")

        if not repo_path:
            raise RuntimeError(
                f"prepare_workspace did not return repo_path: {workspace}"
            )

        print(f"  ✅ repo_path: {repo_path}")

        source_fix_plan = {
            "id": workspace_key,
            "test_id": state.get("test_id"),
            "representative_test_id": state.get("representative_test_id"),
            "supporting_test_ids": state.get("supporting_test_ids", []),
            "playwright_run_id": state.get("playwright_run_id"),
            "group_key": state.get("group_key"),
            "page_type": state.get("page_type"),
            "device_type": state.get("device_type"),
            "site_type": state.get("site_type"),
            "url": state.get("url"),
            "affected_metric": (
                fix_rec.get("affected_metric")
                or opp.get("affected_metric")
            ),
            "action": fix_rec.get("action"),
            "reasoning": fix_rec.get("reasoning"),
            "problem_summary": fix_rec.get("problem_summary"),
            "opportunity": opp,
            "metrics": metrics,
            "priority_level": fix_rec.get("priority_level"),
            "estimated_improvement": fix_rec.get("estimated_improvement"),
        }

        source_context = collect_source_context(
            repo_path=repo_path,
            target_dir=target_dir,
            fix_plan=source_fix_plan,
        )

        matched_files = source_context.get("matched_files")
        total_source_files = source_context.get("total_source_files")

        print(
            f"  ✅ Source context collected: "
            f"matched_files={matched_files}, "
            f"total_source_files={total_source_files}, "
            f"fix_type={source_context.get('fix_type')}"
        )

        patch_result = generate_patch_from_source(
            fix_plan=source_fix_plan,
            source_context=source_context,
            repo_path=repo_path,
            rag_context=state.get("rag_context", ""),
        )

        print(
            "  ✅ Patch result: "
            f"auto_applicable={patch_result.get('auto_applicable')}, "
            f"patch_count={len(patch_result.get('patches', []) or [])}"
        )

        # Duplicate patch prevention inside the same ranked queue.
        generated_signatures = list(state.get("generated_patch_signatures", []) or [])

        if patch_result.get("auto_applicable") and patch_result.get("patches"):
            patch = patch_result["patches"][0]

            signature = "::".join([
                str(patch.get("target_file", "")),
                str(patch.get("original_code", "")),
                str(patch.get("suggested_code", "")),
            ])

            if signature in generated_signatures:
                reason = (
                    "Duplicate patch already generated for another queued Fix Plan "
                    "in the same audit group."
                )
                print(f"  ⚠️ {reason}")

                patch_result = {
                    "auto_applicable": False,
                    "patches": [],
                    "manual_review_reason": reason,
                }

                fix_rec["auto_applicable"] = False
                fix_rec["patches"] = []
                fix_rec["manual_review_reason"] = reason

            else:
                generated_signatures.append(signature)

                fix_rec["auto_applicable"] = True
                fix_rec["patches"] = patch_result.get("patches", [])
                fix_rec["manual_review_reason"] = None

        else:
            fix_rec["auto_applicable"] = False
            fix_rec["patches"] = []
            fix_rec["manual_review_reason"] = patch_result.get(
                "manual_review_reason",
                "No safe source-aware patch could be generated.",
            )

        return {
            **state,
            "fix_recommendation": fix_rec,
            "source_context": source_context,
            "patch_result": patch_result,
            "workspace_path": workspace_path,
            "repo_path": repo_path,
            "generated_patch_signatures": generated_signatures,
        }

    except TypeError as e:
        reason = (
            "Source-aware patch generation failed because function signature "
            f"does not match expected call: {e}"
        )
        print(f"  ⚠️ {reason}")

    except Exception as e:
        reason = f"Source-aware patch generation failed: {e}"
        print(f"  ⚠️ {reason}")

    fix_rec["auto_applicable"] = False
    fix_rec["patches"] = []
    fix_rec["manual_review_reason"] = reason

    return {
        **state,
        "fix_recommendation": fix_rec,
        "patch_result": {
            "auto_applicable": False,
            "patches": [],
            "manual_review_reason": reason,
        },
    }
# ─────────────────────────────────────────────
# N6 — Save Fix Plan
# ─────────────────────────────────────────────

def save_fix_plan(state: AgentState) -> AgentState:
    print("\n[N6] Saving Fix Plan...")

    fix_rec = state["fix_recommendation"]
    opp = state["current_opp"]
    metrics = state["metrics"]

    queue_rank = state.get("opp_index", 0) + 1
    total_queue_items = len(state.get("opportunities", []))

    patches = fix_rec.get("patches", []) or []
    has_patch = bool(fix_rec.get("auto_applicable") and patches)

    # Queue rule:
    # - First auto-applicable plan waits for human review.
    # - Later auto-applicable plans wait in queue.
    # - Non-patchable plans require human review.
    if has_patch:
        patch_status = "pending_review" if queue_rank == 1 else "queued"
    else:
        patch_status = "requires_human_review"

    base_thread_id = state.get("thread_id") or str(uuid.uuid4())
    unique_thread_id = f"{base_thread_id}_{queue_rank}"

    patch_code = {
        "auto_applicable": fix_rec.get("auto_applicable", False),
        "patches": patches,
        "manual_review_reason": fix_rec.get("manual_review_reason"),
    }

    risk_details = state.get("risk_details", {}) or {}

    # Make sure queue/group data is also available in risk_details
    # even if assess_risk did not set it for some reason.
    risk_details.setdefault("group_key", state.get("group_key"))
    risk_details.setdefault("playwright_run_id", state.get("playwright_run_id"))
    risk_details.setdefault("supporting_test_ids", state.get("supporting_test_ids", []))
    risk_details.setdefault("representative_test_id", state.get("representative_test_id"))
    risk_details.setdefault("run_frequency", state.get("run_frequency", 1))
    risk_details.setdefault("queue_rank", queue_rank)
    risk_details.setdefault("total_queue_items", total_queue_items)
    risk_details.setdefault("aggregation_method", "3-run stable group")

    attempt_event = {
        "event": "fix_plan_generated",
        "test_id": state["test_id"],
        "representative_test_id": state.get("representative_test_id"),
        "supporting_test_ids": state.get("supporting_test_ids", []),
        "playwright_run_id": state.get("playwright_run_id"),
        "group_key": state.get("group_key"),
        "queue_rank": queue_rank,
        "total_queue_items": total_queue_items,
        "opportunity_id": opp["id"],
        "lighthouse_opportunity_id": opp.get("opportunity_id"),
        "patch_status": patch_status,
        "auto_applicable": fix_rec.get("auto_applicable", False),
        # Source-aware patch tracking.
        "source_patch_auto_applicable": fix_rec.get("auto_applicable", False),
        "source_patch_count": len(patches),
        "source_patch_reason": fix_rec.get("manual_review_reason"),
        "repo_path": state.get("repo_path"),
        "rag_used": bool(state.get("rag_context")),
        "rag_evidence": state.get("rag_evidence", []),
        "next_step": fix_rec.get("next_step_after_patch"),
    }

    fix_plan_data = {
        # Existing columns
        "thread_id": unique_thread_id,
        "test_id": state["test_id"],
        "opportunity_id": opp["id"],
        "action": fix_rec.get("action", ""),
        "reasoning": fix_rec.get("reasoning", ""),
        "patch_code": patch_code,
        "problem_summary": fix_rec.get("problem_summary"),
        "impact_if_not_fixed": fix_rec.get("impact_if_not_fixed"),
        "impact_if_fixed": fix_rec.get("impact_if_fixed"),
        "ux_improvement": fix_rec.get("ux_improvement"),
        "seo_impact": fix_rec.get("seo_impact"),
        "priority_level": fix_rec.get("priority_level", "medium"),
        "estimated_improvement": fix_rec.get("estimated_improvement", 0),
        "old_score": metrics.get("avg_performance"),
        "total_risk_score": state.get("risk_score", 0),
        "risk_details": risk_details,
        "confidence_level": state.get("confidence", "medium"),
        "patch_status": patch_status,
        "attempt_count": 0,
        "attempt_history": [attempt_event],
        "branch_name": state.get("pr_branch"),

        # New production-ready columns
        "lhci_build_id": state.get("lhci_build_id"),
        "playwright_run_id": state.get("playwright_run_id"),
        "group_key": state.get("group_key"),
        "page_type": state.get("page_type"),
        "device_type": state.get("device_type"),
        "site_type": state.get("site_type"),
        "supporting_test_ids": state.get("supporting_test_ids", []),
        "queue_rank": queue_rank,
        "total_queue_items": total_queue_items,
        "run_frequency": state.get("run_frequency", 1),
        "workspace_path": state.get("workspace_path"),
        "build_status": "not_run",
        "audit_status": "not_run",
    }

    if state.get("dry_run"):
        print("  🔍 DRY RUN — not saving")
        print(json.dumps(fix_plan_data, indent=2, default=str))
        return {
            **state,
            "fix_plan_id": None,
            "fix_plan_ids": state.get("fix_plan_ids", []),
            "opp_index": state.get("opp_index", 0) + 1,
        }

    conn = get_db_connection()
    cursor = conn.cursor()
    fix_plan_id = None

    try:
        fix_plan_id = safe_insert(
            cursor=cursor,
            table_name="fix_plans",
            data=fix_plan_data,
            returning="id",
        )

        if patches:
            for patch in patches:
                change_data = {
                    "fix_plan_id": fix_plan_id,
                    "target_file": patch.get("target_file", "unknown"),
                    "line_start": patch.get("line_start"),
                    "line_end": patch.get("line_end"),
                    "original_code": patch.get("original_code"),
                    "suggested_code": patch.get("suggested_code"),
                    "change_type": patch.get("change_type", "code_replace"),
                    "change_reason": patch.get(
                        "change_reason",
                        fix_rec.get("reasoning", "")
                    ),

                    # New columns if they exist.
                    "apply_status": "pending",
                    "backup_path": None,
                }

                safe_insert(
                    cursor=cursor,
                    table_name="fix_plan_changes",
                    data=change_data,
                    returning="id",
                )
        else:
            print("  ⚠️ No auto-applicable patches generated. Saved Fix Plan only.")

        conn.commit()
        print(
            f"  ✅ Saved fix_plan id={fix_plan_id} "
            f"| status={patch_status} "
            f"| queue_rank={queue_rank}/{total_queue_items}"
        )

    except Exception as e:
        conn.rollback()
        print(f"  ❌ Save failed: {e}")
        fix_plan_id = None

    finally:
        conn.close()

    fix_plan_ids = state.get("fix_plan_ids", [])

    if fix_plan_id:
        fix_plan_ids.append(fix_plan_id)

    return {
        **state,
        "fix_plan_id": fix_plan_id,
        "fix_plan_ids": fix_plan_ids,
        "opp_index": state.get("opp_index", 0) + 1,
    }

# ─────────────────────────────────────────────
# Routing
# ─────────────────────────────────────────────

def route_after_n1(state: AgentState) -> str:
    return "end" if state.get("should_end") else "pick_opportunity"


def route_after_n2(state: AgentState) -> str:
    return "end" if state.get("should_end") else "search_rag"


def route_after_n6(state: AgentState) -> str:
    if state.get("opp_index", 0) < len(state.get("opportunities", [])):
        return "pick_opportunity"
    return "end"


def build_agent():
    graph = StateGraph(AgentState)

    graph.add_node("get_metrics", get_metrics)
    graph.add_node("pick_opportunity", pick_opportunity)
    graph.add_node("search_rag", search_rag)
    graph.add_node("assess_risk", assess_risk)
    graph.add_node("generate_fix", generate_fix)
    graph.add_node("generate_source_patch", generate_source_patch)
    graph.add_node("save_fix_plan", save_fix_plan)

    graph.set_entry_point("get_metrics")

    graph.add_conditional_edges(
        "get_metrics",
        route_after_n1,
        {
            "pick_opportunity": "pick_opportunity",
            "end": END,
        },
    )

    graph.add_conditional_edges(
        "pick_opportunity",
        route_after_n2,
        {
            "search_rag": "search_rag",
            "end": END,
        },
    )

    graph.add_edge("search_rag", "assess_risk")
    graph.add_edge("assess_risk", "generate_fix")
    graph.add_edge("generate_fix", "generate_source_patch")
    graph.add_edge("generate_source_patch", "save_fix_plan")

    graph.add_conditional_edges(
        "save_fix_plan",
        route_after_n6,
        {
            "pick_opportunity": "pick_opportunity",
            "end": END,
        },
    )

    return graph.compile()


# ─────────────────────────────────────────────
# CLI Test
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Luminara Remediation Agent — Staged Self-Healing MVP"
    )

    parser.add_argument("--test-id", type=int, required=True)
    parser.add_argument("--max-opportunities", type=int, default=MAX_OPPORTUNITIES)
    parser.add_argument("--dry-run", action="store_true")

    args = parser.parse_args()

    agent = build_agent()

    print("=" * 55)
    print("REMEDIATION AGENT — Staged Self-Healing MVP")
    print("=" * 55)
    print(f"test_id: {args.test_id}")
    print(f"max_opportunities: {args.max_opportunities}")
    if args.dry_run:
        print("MODE: DRY RUN")
    print("=" * 55)

    result = agent.invoke({
        "test_id": args.test_id,
        "dry_run": args.dry_run,
        "max_opportunities": args.max_opportunities,
        "should_end": False,
        "opp_index": 0,
        "generated_patch_signatures": [],
    })

    print("=" * 55)
    print("✅ Done")
    print(f"test_id:    {result.get('test_id')}")
    print(f"confidence: {result.get('confidence')}")
    print(f"processed:  {result.get('opp_index', 0)} opportunities")
    print("=" * 55)


if __name__ == "__main__":
    main()