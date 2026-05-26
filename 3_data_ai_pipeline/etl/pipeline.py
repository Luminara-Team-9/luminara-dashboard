"""
pipeline.py

Production-ready ETL pipeline for Luminara.

Connects:
    extract.py -> transform.py -> load.py

Modes:
1. Manual mode:
    Process one Lighthouse JSON file and insert it as a new lighthouse_runs row.

2. Auto mode:
    Reprocess existing raw Lighthouse reports when:
    - opportunities are missing
    - important metrics are missing
    - forced reprocess is requested

Important:
- This file does NOT trigger AI remediation.
- This file does NOT update RAG embeddings.
- After ETL finishes, run embed.py separately if RAG should be refreshed.
"""

import argparse
import json
import os
from typing import Any, Dict, List, Optional, Set

from dotenv import load_dotenv

from extract import extract_metrics
from transform import transform
from load import (
    load,
    get_db_connection,
    update_playwright_run,
    insert_opportunities,
    delete_opportunities_for_test,
)


# Search for .env in current dir, then parent dirs (etl/ → 3_data_ai_pipeline/ → ai-analyzer/)
_here = os.path.dirname(os.path.abspath(__file__))
_candidates = [
    os.path.join(_here, ".env"),
    os.path.join(_here, "..", "ai-analyzer", ".env"),
    os.path.join(_here, "..", ".env"),
]
for _env_path in _candidates:
    if os.path.exists(_env_path):
        load_dotenv(_env_path)
        break
else:
    load_dotenv()  # fallback: let python-dotenv search upward


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def read_json_file(filepath: str) -> Dict[str, Any]:
    with open(filepath, "r", encoding="utf-8") as file:
        return json.load(file)


def infer_run_type(site_type: str) -> str:
    if site_type == "competitor":
        return "competitor_scan"
    return "decathlon_daily"


def validate_manual_args(
    filepath: Optional[str],
    site_type: Optional[str],
    page_type: Optional[str],
    device_type: Optional[str],
) -> None:
    missing = []

    if not filepath:
        missing.append("--file")

    if not site_type:
        missing.append("--site_type")

    if not page_type:
        missing.append("--page_type")

    if not device_type:
        missing.append("--device_type")

    if missing:
        raise ValueError(
            "Manual mode requires: " + ", ".join(missing)
        )


def should_reprocess_row(
    row: Dict[str, Any],
    force: bool = False,
) -> bool:
    if force:
        return True

    if row.get("opportunity_count", 0) == 0:
        return True

    required_metric_fields = [
        "lcp_ms",
        "tbt_ms",
        "cls_score",
        "fcp_ms",
        "si_ms",
        "ttfb_ms",
        "performance_score",
    ]

    return any(row.get(field) is None for field in required_metric_fields)


def update_existing_lighthouse_run(
    conn,
    test_id: int,
    transformed: Dict[str, Any],
) -> None:
    """
    Update metrics for an existing lighthouse_runs row.

    Keep metadata fields such as site_type/page_type/device_type as-is.
    """
    with conn.cursor() as cursor:
        cursor.execute(
            """
            UPDATE lighthouse_runs
            SET
                timestamp            = COALESCE(%s, timestamp),
                lcp_ms               = %s,
                tbt_ms               = %s,
                cls_score            = %s,
                fcp_ms               = %s,
                si_ms                = %s,
                tti_ms               = %s,
                ttfb_ms              = %s,
                inp_ms               = %s,
                performance_score    = %s,
                accessibility_score  = %s,
                best_practices_score = %s,
                seo_score            = %s,
                total_requests       = %s,
                page_size_kb         = %s,
                js_size_kb           = %s,
                css_size_kb          = %s,
                image_size_kb        = %s
            WHERE test_id = %s
            """,
            (
                transformed.get("timestamp"),
                transformed.get("lcp_ms"),
                transformed.get("tbt_ms"),
                transformed.get("cls_score"),
                transformed.get("fcp_ms"),
                transformed.get("si_ms"),
                transformed.get("tti_ms"),
                transformed.get("ttfb_ms"),
                transformed.get("inp_ms"),
                transformed.get("performance_score"),
                transformed.get("accessibility_score"),
                transformed.get("best_practices_score"),
                transformed.get("seo_score"),
                transformed.get("total_requests"),
                transformed.get("page_size_kb"),
                transformed.get("js_size_kb"),
                transformed.get("css_size_kb"),
                transformed.get("image_size_kb"),
                test_id,
            ),
        )


def opportunities_referenced_by_fix_plans(conn, test_id: int) -> int:
    """
    Check whether current opportunities are referenced by fix_plans.

    If referenced, do not delete them, because that may break FK references.
    """
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM fix_plans fp
            JOIN lighthouse_opportunities lo
              ON fp.opportunity_id = lo.id
            WHERE lo.test_id = %s
            """,
            (test_id,),
        )

        return int(cursor.fetchone()[0] or 0)


def refresh_opportunities_safely(
    conn,
    test_id: int,
    opportunities: List[Dict[str, Any]],
) -> str:
    """
    Refresh opportunities if they are not referenced by fix_plans.

    Returns:
        refreshed | kept_referenced | no_opportunities
    """
    if not opportunities:
        return "no_opportunities"

    referenced_count = opportunities_referenced_by_fix_plans(
        conn=conn,
        test_id=test_id,
    )

    if referenced_count > 0:
        return f"kept_referenced:{referenced_count}"

    delete_opportunities_for_test(conn, test_id)

    insert_opportunities(
        conn=conn,
        test_id=test_id,
        opportunities=opportunities,
    )

    return "refreshed"


# ─────────────────────────────────────────────
# Manual mode
# ─────────────────────────────────────────────

def run_pipeline(
    filepath: str,
    site_type: str,
    page_type: str,
    device_type: str,
    run_number: int,
    competitor_name: Optional[str] = None,
    network_profile: Optional[str] = None,
    playwright_run_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Process one Lighthouse JSON file and insert a new DB row.
    """
    print("=" * 60)
    print("ETL PIPELINE — MANUAL MODE")
    print("=" * 60)

    validate_manual_args(
        filepath=filepath,
        site_type=site_type,
        page_type=page_type,
        device_type=device_type,
    )

    run_type = infer_run_type(site_type)

    raw_json = read_json_file(filepath)

    print("\n[1/3] Extracting...")
    extracted = extract_metrics(raw_json)

    print("[2/3] Transforming...")
    transformed = transform(extracted)

    metadata = {
        "run_type": run_type,
        "site_type": site_type,
        "competitor_name": competitor_name,
        "page_type": page_type,
        "device_type": device_type,
        "network_profile": network_profile,
        "run_number": run_number,
        "url": extracted.get("url"),
    }

    print("[3/3] Loading into core_db...")
    result = load(
        transformed=transformed,
        raw_json=raw_json,
        metadata=metadata,
        playwright_run_id=playwright_run_id,
    )

    print("\n" + "=" * 60)
    if result.get("success"):
        print("✅ Manual ETL completed")
        print(f"playwright_run_id: {result.get('playwright_run_id')}")
        print(f"test_id: {result.get('test_id')}")
        print(f"opportunities: {result.get('opportunity_count')}")
    else:
        print("❌ Manual ETL failed")
        print(result.get("error"))
    print("=" * 60)

    return result


# ─────────────────────────────────────────────
# Auto mode
# ─────────────────────────────────────────────

def fetch_reprocess_candidates(conn, force: bool = False) -> List[Dict[str, Any]]:
    """
    Fetch raw reports that should be reprocessed.

    force=False:
        Only missing metrics/opportunities.

    force=True:
        Reprocess all raw reports.
    """
    with conn.cursor() as cursor:
        if force:
            cursor.execute(
                """
                SELECT
                    lr.test_id,
                    lr.playwright_run_id,
                    lr.site_type,
                    lr.competitor_name,
                    lr.page_type,
                    lr.device_type,
                    lr.network_profile,
                    lr.run_number,
                    lr.lcp_ms,
                    lr.tbt_ms,
                    lr.cls_score,
                    lr.fcp_ms,
                    lr.si_ms,
                    lr.tti_ms,
                    lr.ttfb_ms,
                    lr.performance_score,
                    lrr.raw_json,
                    (
                        SELECT COUNT(*)
                        FROM lighthouse_opportunities lo
                        WHERE lo.test_id = lr.test_id
                    ) AS opportunity_count
                FROM lighthouse_runs lr
                JOIN lighthouse_raw_reports lrr
                  ON lr.test_id = lrr.test_id
                ORDER BY lr.timestamp ASC NULLS LAST, lr.test_id ASC
                """
            )
        else:
            cursor.execute(
                """
                SELECT
                    lr.test_id,
                    lr.playwright_run_id,
                    lr.site_type,
                    lr.competitor_name,
                    lr.page_type,
                    lr.device_type,
                    lr.network_profile,
                    lr.run_number,
                    lr.lcp_ms,
                    lr.tbt_ms,
                    lr.cls_score,
                    lr.fcp_ms,
                    lr.si_ms,
                    lr.tti_ms,
                    lr.ttfb_ms,
                    lr.performance_score,
                    lrr.raw_json,
                    (
                        SELECT COUNT(*)
                        FROM lighthouse_opportunities lo
                        WHERE lo.test_id = lr.test_id
                    ) AS opportunity_count
                FROM lighthouse_runs lr
                JOIN lighthouse_raw_reports lrr
                  ON lr.test_id = lrr.test_id
                WHERE
                    NOT EXISTS (
                        SELECT 1
                        FROM lighthouse_opportunities lo
                        WHERE lo.test_id = lr.test_id
                    )
                    OR lr.lcp_ms IS NULL
                    OR lr.tbt_ms IS NULL
                    OR lr.cls_score IS NULL
                    OR lr.fcp_ms IS NULL
                    OR lr.si_ms IS NULL
                    OR lr.ttfb_ms IS NULL
                    OR lr.performance_score IS NULL
                ORDER BY lr.timestamp ASC NULLS LAST, lr.test_id ASC
                """
            )

        columns = [desc[0] for desc in cursor.description]
        return [
            dict(zip(columns, row))
            for row in cursor.fetchall()
        ]


def reprocess_one_existing_report(
    conn,
    row: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Reprocess one existing raw report.

    Updates:
    - lighthouse_runs metrics
    - lighthouse_opportunities if safe
    """
    test_id = row["test_id"]
    raw_json = row["raw_json"]

    print(f"\n→ Reprocessing test_id: {test_id}")

    extracted = extract_metrics(raw_json)
    transformed = transform(extracted)

    update_existing_lighthouse_run(
        conn=conn,
        test_id=test_id,
        transformed=transformed,
    )

    opportunity_status = refresh_opportunities_safely(
        conn=conn,
        test_id=test_id,
        opportunities=transformed.get("opportunities", []),
    )

    return {
        "test_id": test_id,
        "playwright_run_id": row.get("playwright_run_id"),
        "success": True,
        "performance_score": transformed.get("performance_score"),
        "opportunity_count": len(transformed.get("opportunities", [])),
        "opportunity_status": opportunity_status,
    }


def update_playwright_runs_after_auto(
    conn,
    processed_results: List[Dict[str, Any]],
) -> None:
    """
    Update affected playwright_runs.

    Counts are per playwright_run_id, not global.
    """
    run_ids: Set[int] = {
        result["playwright_run_id"]
        for result in processed_results
        if result.get("playwright_run_id") is not None
    }

    for run_id in run_ids:
        success_count = sum(
            1
            for result in processed_results
            if result.get("playwright_run_id") == run_id
            and result.get("success")
        )

        failed_count = sum(
            1
            for result in processed_results
            if result.get("playwright_run_id") == run_id
            and not result.get("success")
        )

        update_playwright_run(
            conn=conn,
            playwright_run_id=run_id,
            success_count=success_count,
            failed_count=failed_count,
        )


def run_auto(force: bool = False) -> Dict[str, Any]:
    """
    Reprocess existing reports from lighthouse_raw_reports.
    """
    print("=" * 60)
    print("ETL PIPELINE — AUTO MODE")
    print("=" * 60)
    print(f"force: {force}")

    conn = None
    processed_results = []

    try:
        conn = get_db_connection()
        conn.autocommit = False

        rows = fetch_reprocess_candidates(
            conn=conn,
            force=force,
        )

        print(f"Found {len(rows)} reports to process/reprocess")

        if not rows:
            print("✅ Nothing to process — all up to date!")
            return {
                "success": True,
                "processed": 0,
                "failed": 0,
                "results": [],
            }

        for row in rows:
            test_id = row.get("test_id")

            if not should_reprocess_row(row, force=force):
                continue

            try:
                result = reprocess_one_existing_report(
                    conn=conn,
                    row=row,
                )

                conn.commit()

                processed_results.append(result)

                print(f"✅ test_id {test_id} done")
                print(f"   performance: {result.get('performance_score')}")
                print(f"   opportunities: {result.get('opportunity_count')}")
                print(f"   opportunity_status: {result.get('opportunity_status')}")

            except Exception as e:
                conn.rollback()

                failed_result = {
                    "test_id": test_id,
                    "playwright_run_id": row.get("playwright_run_id"),
                    "success": False,
                    "error": str(e),
                }

                processed_results.append(failed_result)

                print(f"❌ test_id {test_id} failed: {e}")

        update_playwright_runs_after_auto(
            conn=conn,
            processed_results=processed_results,
        )
        conn.commit()

        success_count = sum(
            1
            for item in processed_results
            if item.get("success")
        )
        failed_count = sum(
            1
            for item in processed_results
            if not item.get("success")
        )

        print("\n" + "=" * 60)
        print(f"✅ Success: {success_count}")
        print(f"❌ Failed:  {failed_count}")
        print("=" * 60)

        return {
            "success": failed_count == 0,
            "processed": success_count,
            "failed": failed_count,
            "results": processed_results,
        }

    except Exception as e:
        print(f"❌ Auto pipeline failed: {e}")

        if conn:
            conn.rollback()

        return {
            "success": False,
            "processed": 0,
            "failed": 1,
            "error": str(e),
        }

    finally:
        if conn:
            conn.close()


# ─────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Luminara ETL Pipeline"
    )

    parser.add_argument(
        "--auto",
        action="store_true",
        help="Reprocess existing raw reports that are missing metrics/opportunities.",
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help="Force auto mode to reprocess all raw reports.",
    )

    parser.add_argument("--file")
    parser.add_argument(
        "--site_type",
        choices=["decathlon", "target", "competitor"],
    )
    parser.add_argument("--page_type")
    parser.add_argument(
        "--device_type",
        choices=["mobile", "desktop"],
    )
    parser.add_argument("--run_number", type=int, default=1)
    parser.add_argument("--competitor_name", default=None)
    parser.add_argument("--network_profile", default=None)
    parser.add_argument("--playwright_run_id", type=int, default=None)

    args = parser.parse_args()

    if args.auto:
        run_auto(force=args.force)

    elif args.file:
        try:
            run_pipeline(
                filepath=args.file,
                site_type=args.site_type,
                page_type=args.page_type,
                device_type=args.device_type,
                run_number=args.run_number,
                competitor_name=args.competitor_name,
                network_profile=args.network_profile,
                playwright_run_id=args.playwright_run_id,
            )
        except Exception as e:
            print(f"❌ Manual pipeline failed: {e}")

    else:
        print("❌ Please specify mode:")
        print(
            "   Manual: --file lighthouse.json "
            "--site_type decathlon --page_type product --device_type mobile"
        )
        print("   Auto:   --auto")
        print("   Force:  --auto --force")


if __name__ == "__main__":
    main()