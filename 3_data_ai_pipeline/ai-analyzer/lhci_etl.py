"""
lhci_etl.py

ETL: read processed metrics from lhci.runs → write to core_db.lhci_audit_runs.

One row per (lhci_build_id, lhci_run_id). Idempotent — safe to call multiple times.
Called by the listener after agent completes for a given lhci_build_id.
"""

import json
import logging
from urllib.parse import urlparse

try:
    from ra_runtime.db_client import get_lhci_connection, get_db_connection
except ImportError:
    from db_client import get_lhci_connection, get_db_connection

logger = logging.getLogger(__name__)


_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS lhci_audit_runs (
    id                      SERIAL PRIMARY KEY,
    lhci_build_id           TEXT NOT NULL,
    lhci_run_id             TEXT NOT NULL,
    url                     TEXT NOT NULL,
    page_type               TEXT,
    form_factor             TEXT,
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

_INSERT_SQL = """
INSERT INTO lhci_audit_runs (
    lhci_build_id, lhci_run_id, url, page_type, form_factor,
    performance_score, accessibility_score, best_practices_score, seo_score,
    lcp_ms, tbt_ms, cls_score, fcp_ms, si_ms, tti_ms, ttfb_ms, inp_ms,
    total_byte_weight_kb, total_requests
) VALUES (
    %s, %s, %s, %s, %s,
    %s, %s, %s, %s,
    %s, %s, %s, %s, %s, %s, %s, %s,
    %s, %s
)
ON CONFLICT (lhci_build_id, lhci_run_id) DO NOTHING
"""


def _url_to_page_type(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    if not path:
        return "main"
    parts = [p for p in path.split("/") if p]
    return parts[0] if parts else "main"


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


def run_etl(lhci_build_id: str) -> int:
    """
    Extract runs for lhci_build_id from lhci DB and load into core_db.lhci_audit_runs.
    Returns number of rows newly inserted. Already-existing rows are skipped.
    """
    lhci_conn = get_lhci_connection()
    core_conn = get_db_connection()
    inserted = 0

    try:
        with core_conn.cursor() as cur:
            cur.execute(_CREATE_TABLE_SQL)
        core_conn.commit()

        with lhci_conn.cursor() as cur:
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
                        lhci_build_id, str(run_id), url, _url_to_page_type(url), form_factor,
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
            "[ETL] lhci_build_id=%s: %d/%d rows inserted",
            lhci_build_id, inserted, len(runs),
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
        with core_conn.cursor() as cur:
            cur.execute(_CREATE_TABLE_SQL)
        core_conn.commit()

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
    return {"processed": len(new_builds), "builds": results}
