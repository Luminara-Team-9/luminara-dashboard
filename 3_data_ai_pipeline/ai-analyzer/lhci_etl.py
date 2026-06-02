"""
lhci_etl.py

ETL: read processed metrics from lhci.runs → write to core_db.lhci_audit_runs + lhci_raw_reports.

One row per (lhci_build_id, lhci_run_id). Idempotent — safe to call multiple times.
Called by the listener after agent completes for a given lhci_build_id.
"""

import json
import logging
from urllib.parse import urlparse

try:
    from ra_runtime.db_client import (
        get_lhci_connection, get_db_connection,
        save_local_test_result, get_fix_plan_changes,
    )
except ImportError:
    from db_client import (
        get_lhci_connection, get_db_connection,
        save_local_test_result, get_fix_plan_changes,
    )

logger = logging.getLogger(__name__)


_CREATE_AUDIT_RUNS_SQL = """
CREATE TABLE IF NOT EXISTS lhci_audit_runs (
    id                      SERIAL PRIMARY KEY,
    lhci_build_id           TEXT NOT NULL,
    lhci_run_id             TEXT NOT NULL,
    url                     TEXT NOT NULL,
    page_type               TEXT,
    site_type               TEXT,
    form_factor             TEXT,
    pr_branch               TEXT,
    performance_score       FLOAT,
    accessibility_score     FLOAT,
    best_practices_score    FLOAT,
    seo_score               FLOAT,
    lcp_ms                  FLOAT,
    tbt_ms                  FLOAT,
    cls_score               FLOAT,
    fcp_ms                  FLOAT,
    si_ms                   FLOAT,
    tti_ms                  FLOAT,
    ttfb_ms                 FLOAT,
    inp_ms                  FLOAT,
    total_byte_weight_kb    FLOAT,
    total_requests          INTEGER,
    created_at              TIMESTAMP DEFAULT NOW(),
    UNIQUE (lhci_build_id, lhci_run_id)
);
"""

# Migrate existing tables — safe to run repeatedly (IF NOT EXISTS)
_MIGRATE_SQL = """
ALTER TABLE lhci_audit_runs ADD COLUMN IF NOT EXISTS site_type TEXT;
ALTER TABLE lhci_audit_runs ADD COLUMN IF NOT EXISTS pr_branch TEXT;
ALTER TABLE fix_plans ADD COLUMN IF NOT EXISTS lhci_build_id TEXT;
ALTER TABLE fix_plans ADD COLUMN IF NOT EXISTS score_delta FLOAT;
"""

_INSERT_SQL = """
INSERT INTO lhci_audit_runs (
    lhci_build_id, lhci_run_id, url, page_type, site_type, form_factor, pr_branch,
    performance_score, accessibility_score, best_practices_score, seo_score,
    lcp_ms, tbt_ms, cls_score, fcp_ms, si_ms, tti_ms, ttfb_ms, inp_ms,
    total_byte_weight_kb, total_requests
) VALUES (
    %s, %s, %s, %s, %s, %s, %s,
    %s, %s, %s, %s,
    %s, %s, %s, %s, %s, %s, %s, %s,
    %s, %s
)
ON CONFLICT (lhci_build_id, lhci_run_id) DO NOTHING
"""

# Target hosts — everything else is a competitor.
_TARGET_HOSTS = {"localhost", "decathlon.co.kr"}

# Short path prefixes used in Decathlon/localhost URLs.
_PATH_PREFIX_MAP = {
    "c": "category",
    "p": "product",
    "cart": "cart",
    "category": "category",
    "product": "product",
}


def _url_to_page_type(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.hostname or ""

    is_target = host == "localhost" or any(host.endswith(t) for t in _TARGET_HOSTS)
    if not is_target:
        return "main"  # competitor page → always main

    path = parsed.path.rstrip("/")
    if not path:
        return "main"

    parts = [p for p in path.split("/") if p]
    if not parts:
        return "main"

    return _PATH_PREFIX_MAP.get(parts[0], parts[0])


def _url_to_site_type(url: str) -> str:
    host = urlparse(url).hostname or ""
    if host == "localhost":
        return "target"
    if host.endswith("decathlon.co.kr"):
        return "decathlon"
    return "competitor"


def _extract_metrics(lhr: dict) -> dict:
    def n(path: str):
        keys = path.split(".")
        val = lhr
        for k in keys:
            val = val.get(k) if isinstance(val, dict) else None
        return float(val) if val is not None else None

    def score(path: str):
        v = n(path)
        return round(v * 100, 1) if v is not None else None

    network_items = (
        lhr.get("audits", {})
        .get("network-requests", {})
        .get("details", {})
        .get("items", [])
    ) or []

    return {
        "performance_score":    score("categories.performance.score"),
        "accessibility_score":  score("categories.accessibility.score"),
        "best_practices_score": score("categories.best-practices.score"),
        "seo_score":            score("categories.seo.score"),
        "lcp_ms":   n("audits.largest-contentful-paint.numericValue"),
        "tbt_ms":   n("audits.total-blocking-time.numericValue"),
        "cls_score": n("audits.cumulative-layout-shift.numericValue"),
        "fcp_ms":   n("audits.first-contentful-paint.numericValue"),
        "si_ms":    n("audits.speed-index.numericValue"),
        "tti_ms":   n("audits.interactive.numericValue"),
        "ttfb_ms":  n("audits.server-response-time.numericValue"),
        "inp_ms": (
            n("audits.interaction-to-next-paint.numericValue")
            or n("audits.experimental-interaction-to-next-paint.numericValue")
        ),
        "total_byte_weight_kb": round(
            (n("audits.total-byte-weight.numericValue") or 0) / 1024, 2
        ),
        "total_requests": len(network_items),
    }


def _ensure_schema(core_conn):
    with core_conn.cursor() as cur:
        cur.execute(_CREATE_AUDIT_RUNS_SQL)
        cur.execute(_MIGRATE_SQL)
    core_conn.commit()


def run_etl(lhci_build_id: str) -> int:
    """
    Extract runs for lhci_build_id from lhci DB and load into core_db.
    Writes metrics to lhci_audit_runs and raw JSON to lhci_raw_reports.
    Returns number of rows newly inserted into lhci_audit_runs.
    """
    lhci_conn = get_lhci_connection()
    core_conn = get_db_connection()
    inserted = 0

    try:
        _ensure_schema(core_conn)

        with lhci_conn.cursor() as cur:
            # Pull branch from builds table
            cur.execute('SELECT branch FROM builds WHERE id = %s', (lhci_build_id,))
            build_row = cur.fetchone()
            pr_branch = build_row[0] if build_row else None

            cur.execute(
                'SELECT id, url, lhr FROM runs WHERE "buildId" = %s',
                (lhci_build_id,),
            )
            runs = cur.fetchall()

        if not runs:
            logger.warning("[ETL] No runs found for lhci_build_id=%s", lhci_build_id)
            return 0

        with core_conn.cursor() as cur:
            for run_id, url, lhr_raw in runs:
                lhr = json.loads(lhr_raw) if isinstance(lhr_raw, str) else lhr_raw
                cfg = lhr.get("configSettings", {})
                form_factor = cfg.get("formFactor") or cfg.get("emulatedFormFactor", "unknown")
                m = _extract_metrics(lhr)

                cur.execute(
                    _INSERT_SQL,
                    (
                        lhci_build_id, str(run_id), url,
                        _url_to_page_type(url), _url_to_site_type(url), form_factor, pr_branch,
                        m["performance_score"], m["accessibility_score"],
                        m["best_practices_score"], m["seo_score"],
                        m["lcp_ms"], m["tbt_ms"], m["cls_score"],
                        m["fcp_ms"], m["si_ms"], m["tti_ms"],
                        m["ttfb_ms"], m["inp_ms"],
                        m["total_byte_weight_kb"], m["total_requests"],
                    ),
                )
                inserted += cur.rowcount

        core_conn.commit()
        logger.info(
            "[ETL] lhci_build_id=%s branch=%s: %d/%d rows inserted",
            lhci_build_id, pr_branch, inserted, len(runs),
        )
        return inserted

    except Exception:
        core_conn.rollback()
        logger.exception("[ETL] Failed for lhci_build_id=%s", lhci_build_id)
        raise

    finally:
        lhci_conn.close()
        core_conn.close()


def sync_etl() -> dict:
    """
    Find all lhci builds not yet in lhci_audit_runs and ETL each one.
    Safe to call repeatedly — idempotent per build.
    Returns summary of builds processed.
    """
    lhci_conn = get_lhci_connection()
    core_conn = get_db_connection()

    try:
        _ensure_schema(core_conn)

        with lhci_conn.cursor() as lhci_cur:
            lhci_cur.execute('SELECT id FROM builds ORDER BY "createdAt" DESC LIMIT 50')
            all_build_ids = [row[0] for row in lhci_cur.fetchall()]

        if not all_build_ids:
            return {"processed": 0, "builds": []}

        with core_conn.cursor() as core_cur:
            core_cur.execute(
                "SELECT DISTINCT lhci_build_id FROM lhci_audit_runs WHERE lhci_build_id = ANY(%s)",
                (all_build_ids,),
            )
            already_done = {row[0] for row in core_cur.fetchall()}

        new_builds = [b for b in all_build_ids if b not in already_done]

    finally:
        lhci_conn.close()
        core_conn.close()

    if not new_builds:
        logger.info("[ETL sync] No new builds to process")
        return {"processed": 0, "builds": []}

    results = []
    for build_id in new_builds:
        try:
            rows = run_etl(build_id)
            results.append({"lhci_build_id": build_id, "rows_inserted": rows, "status": "ok"})
        except Exception as e:
            logger.error("[ETL sync] Failed for build %s: %s", build_id, e)
            results.append({"lhci_build_id": build_id, "rows_inserted": 0, "status": "error", "error": str(e)})

    logger.info("[ETL sync] Processed %d new builds", len(new_builds))

    # Also link LHCI scores back to pushed fix plans
    try:
        link_result = link_fix_plan_scores()
        logger.info("[ETL sync] Linked %d fix plan scores", link_result["linked"])
    except Exception as e:
        logger.error("[ETL sync] link_fix_plan_scores failed: %s", e)
        link_result = {"linked": 0}

    return {"processed": len(new_builds), "builds": results, "linked_scores": link_result["linked"]}


# ─────────────────────────────────────────────────────────────────────────────
# Feedback loop — link LHCI scores back to fix_plans after fix branch runs
# ─────────────────────────────────────────────────────────────────────────────

_CREATE_PROVEN_FIX_DOCS_SQL = """
CREATE TABLE IF NOT EXISTS proven_fix_docs (
    id          SERIAL PRIMARY KEY,
    fix_plan_id INTEGER NOT NULL UNIQUE,
    source      TEXT NOT NULL UNIQUE,
    content     TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);
"""


def _save_proven_fix_doc(core_conn, fix_plan_id, page_type, device_type, site_type,
                          before_score, after_score, action, opp_id):
    """
    Write a proven fix as a text document into proven_fix_docs.
    The daily embed.py run will pick this up and embed it into rag_documents.
    """
    changes = get_fix_plan_changes(fix_plan_id, only_pending=False)
    change_lines = []
    for c in (changes or [])[:5]:
        change_lines.append(
            f"File: {c.get('target_file', '')}\n"
            f"Reason: {c.get('change_reason', '')}\n"
            f"Original (excerpt): {(c.get('original_code') or '')[:200]}\n"
            f"Fixed (excerpt): {(c.get('suggested_code') or '')[:200]}"
        )

    improvement = round(after_score - before_score, 1)
    content = (
        f"Proven Fix: {action or opp_id} on {site_type}/{page_type}/{device_type}\n"
        f"Opportunity: {opp_id}\n"
        f"Performance score: {before_score:.0f} → {after_score:.0f} (+{improvement} points)\n\n"
        "Code changes:\n" + "\n---\n".join(change_lines)
    )
    source = f"proven_fix_{site_type}_{page_type}_{device_type}_{opp_id}_{fix_plan_id}"

    with core_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO proven_fix_docs (fix_plan_id, source, content)
            VALUES (%s, %s, %s)
            ON CONFLICT (fix_plan_id) DO UPDATE SET
                content = EXCLUDED.content,
                source  = EXCLUDED.source
            """,
            (fix_plan_id, source, content),
        )


def link_fix_plan_scores() -> dict:
    """
    For fix plans with patch_status='pushed' and new_local_score IS NULL:
    1. Look up lhci_audit_runs for the fix branch (fix/ai-patch-{id}).
    2. Compare performance score to the original build's score.
    3. Update new_local_score via save_local_test_result.
    4. Save proven fixes (improved score) to proven_fix_docs for RAG embedding.
    """
    core_conn = get_db_connection()
    linked = []

    try:
        with core_conn.cursor() as cur:
            cur.execute(_CREATE_PROVEN_FIX_DOCS_SQL)
        core_conn.commit()

        with core_conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, page_type, device_type, site_type,
                       lhci_build_id, action, opportunity_id
                FROM fix_plans
                WHERE patch_status IN ('pushed', 'pr_merged')
                AND after_score IS NULL
                """
            )
            pending = cur.fetchall()

        for fix_plan_id, page_type, device_type, site_type, lhci_build_id, action, opp_id in pending:
            fix_branch = f"fix/ai-patch-{fix_plan_id}"

            with core_conn.cursor() as cur:
                # Score after fix
                cur.execute(
                    """
                    SELECT AVG(performance_score)
                    FROM lhci_audit_runs
                    WHERE pr_branch = %s AND page_type = %s AND form_factor = %s
                    """,
                    (fix_branch, page_type, device_type),
                )
                after_row = cur.fetchone()

                # Score before fix (original build)
                cur.execute(
                    """
                    SELECT AVG(performance_score)
                    FROM lhci_audit_runs
                    WHERE lhci_build_id = %s AND page_type = %s AND form_factor = %s
                    """,
                    (lhci_build_id, page_type, device_type),
                )
                before_row = cur.fetchone()

            if not after_row or after_row[0] is None:
                continue  # fix branch LHCI hasn't run yet

            after_score = round(float(after_row[0]), 1)
            before_score = round(float(before_row[0]), 1) if before_row and before_row[0] else 0.0
            improvement = round(after_score - before_score, 1)
            improved = improvement > 0

            # Update new_local_score and final status on fix_plan
            final_status = "completed" if improved else "regression"
            score_note = (
                f"Score improved: {before_score:.0f} → {after_score:.0f} (+{improvement} points)"
                if improved else
                f"Score did not improve: {before_score:.0f} → {after_score:.0f} ({improvement:+.1f} points)"
            )

            with core_conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE fix_plans
                    SET after_score  = %s,
                        patch_status = %s,
                        score_delta  = %s,
                        updated_at   = NOW()
                    WHERE id = %s
                    """,
                    (after_score, final_status, improvement, fix_plan_id),
                )

            logger.info("[link_scores] fix_plan_id=%d %s", fix_plan_id, score_note)

            if improved:
                _save_proven_fix_doc(
                    core_conn, fix_plan_id, page_type, device_type,
                    site_type or "decathlon", before_score, after_score, action, opp_id,
                )

            linked.append({
                "fix_plan_id": fix_plan_id,
                "before_score": before_score,
                "after_score": after_score,
                "improvement": improvement,
                "status": final_status,
            })

        core_conn.commit()
        logger.info("[link_scores] linked=%d", len(linked))
        return {"linked": len(linked), "fixes": linked}

    except Exception:
        core_conn.rollback()
        logger.exception("[link_scores] failed")
        raise

    finally:
        core_conn.close()
