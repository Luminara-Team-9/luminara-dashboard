"""
load.py

Production-ready loader for Luminara Lighthouse ETL.

Purpose:
- Insert transformed Lighthouse data into PostgreSQL.
- Store raw Lighthouse report.
- Store Lighthouse opportunities.
- Support both old and new transform.py output.
- Adapt safely if optional DB columns do not exist yet.

Flow:
    transformed data + raw_json + metadata -> PostgreSQL

This file does not run Lighthouse.
"""

import os
from typing import Any, Dict, List, Optional, Set

import psycopg2
from psycopg2.extras import Json, execute_batch
from dotenv import load_dotenv


load_dotenv()


# ─────────────────────────────────────────────
# DB Connection
# ─────────────────────────────────────────────

def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("HOST_IP", "127.0.0.1"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )


def get_table_columns(conn, table_name: str) -> Set[str]:
    """
    Read available columns from PostgreSQL.

    This makes load.py production-safe while your schema is still evolving.
    Example:
    - If lighthouse_opportunities.affected_metric exists, insert it.
    - If it does not exist yet, skip it instead of failing.
    """
    with conn.cursor() as cursor:
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


# ─────────────────────────────────────────────
# Validation helpers
# ─────────────────────────────────────────────

def require_metadata(metadata: Dict[str, Any], required_keys: List[str]) -> None:
    missing = [
        key
        for key in required_keys
        if metadata.get(key) is None
    ]

    if missing:
        raise ValueError(
            "Missing required metadata fields: " + ", ".join(missing)
        )


def get_value(data: Dict[str, Any], key: str, default: Any = None) -> Any:
    return data.get(key, default)


# ─────────────────────────────────────────────
# Playwright run
# ─────────────────────────────────────────────

def create_playwright_run(conn, metadata: Dict[str, Any]) -> int:
    """
    Create a parent playwright_runs row when caller does not provide one.
    """
    require_metadata(metadata, ["run_type", "url", "device_type"])

    with conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO playwright_runs (
                run_type,
                url,
                device_type,
                started_at,
                status
            )
            VALUES (%s, %s, %s, NOW(), 'running')
            RETURNING id
            """,
            (
                metadata.get("run_type"),
                metadata.get("url"),
                metadata.get("device_type"),
            ),
        )

        return cursor.fetchone()[0]


def update_playwright_run(
    conn,
    playwright_run_id: int,
    success_count: int,
    failed_count: int,
) -> None:
    """
    Update parent playwright run status.

    This function is kept for pipeline compatibility.
    Caller can use it after all page/device runs finish.
    """
    if failed_count == 0:
        status = "completed"
    elif success_count == 0:
        status = "failed"
    else:
        status = "partial"

    with conn.cursor() as cursor:
        cursor.execute(
            """
            UPDATE playwright_runs
            SET
                finished_at   = NOW(),
                total_tests   = %s,
                success_count = %s,
                failed_count  = %s,
                status        = %s
            WHERE id = %s
            """,
            (
                success_count + failed_count,
                success_count,
                failed_count,
                status,
                playwright_run_id,
            ),
        )


# ─────────────────────────────────────────────
# Lighthouse run
# ─────────────────────────────────────────────

def insert_lighthouse_run(
    conn,
    transformed: Dict[str, Any],
    metadata: Dict[str, Any],
    playwright_run_id: int,
) -> int:
    """
    Insert one Lighthouse run.

    Required metadata:
    - site_type
    - page_type
    - device_type
    - run_number
    """
    require_metadata(
        metadata,
        ["site_type", "page_type", "device_type", "run_number"],
    )

    with conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO lighthouse_runs (
                playwright_run_id,
                url,
                site_type,
                competitor_name,
                page_type,
                device_type,
                network_profile,
                run_number,
                timestamp,
                lcp_ms,
                tbt_ms,
                cls_score,
                fcp_ms,
                si_ms,
                tti_ms,
                ttfb_ms,
                inp_ms,
                performance_score,
                accessibility_score,
                best_practices_score,
                seo_score,
                total_requests,
                page_size_kb,
                js_size_kb,
                css_size_kb,
                image_size_kb
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            RETURNING test_id
            """,
            (
                playwright_run_id,
                transformed.get("url"),
                metadata.get("site_type"),
                metadata.get("competitor_name"),
                metadata.get("page_type"),
                metadata.get("device_type"),
                metadata.get("network_profile"),
                metadata.get("run_number"),
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
            ),
        )

        return cursor.fetchone()[0]


# ─────────────────────────────────────────────
# Raw report
# ─────────────────────────────────────────────

def insert_raw_report(conn, test_id: int, raw_json: Dict[str, Any]) -> None:
    """
    Insert raw Lighthouse JSON report.

    If test_id is unique in lighthouse_raw_reports, update on conflict.
    If no unique constraint exists, regular insert still works unless duplicate.
    """
    raw_report_columns = get_table_columns(conn, "lighthouse_raw_reports")

    with conn.cursor() as cursor:
        if "test_id" in raw_report_columns and "raw_json" in raw_report_columns:
            try:
                cursor.execute(
                    """
                    INSERT INTO lighthouse_raw_reports (
                        test_id,
                        raw_json
                    )
                    VALUES (%s, %s)
                    ON CONFLICT (test_id)
                    DO UPDATE SET
                        raw_json = EXCLUDED.raw_json,
                        created_at = COALESCE(
                            lighthouse_raw_reports.created_at,
                            NOW()
                        )
                    """,
                    (
                        test_id,
                        Json(raw_json),
                    ),
                )
            except psycopg2.errors.InvalidColumnReference:
                conn.rollback()
                raise RuntimeError(
                    "lighthouse_raw_reports needs UNIQUE(test_id) for "
                    "ON CONFLICT support, or remove duplicate loading."
                )
        else:
            raise RuntimeError(
                "lighthouse_raw_reports table is missing test_id or raw_json column."
            )


# ─────────────────────────────────────────────
# Opportunities
# ─────────────────────────────────────────────

def delete_opportunities_for_test(conn, test_id: int) -> None:
    """
    Delete existing opportunities for one test_id.

    Useful if reprocessing same Lighthouse report.
    For normal insert of new test_id, this is harmless.
    """
    with conn.cursor() as cursor:
        cursor.execute(
            "DELETE FROM lighthouse_opportunities WHERE test_id = %s",
            (test_id,),
        )


def build_opportunity_insert_rows(
    opportunities: List[Dict[str, Any]],
    test_id: int,
    available_columns: Set[str],
) -> tuple[List[str], List[tuple]]:
    """
    Build schema-flexible insert rows.

    Supports old schema:
    - test_id
    - opportunity_id
    - title
    - description
    - savings_ms
    - severity
    - category
    - details

    Supports new optional columns if they exist:
    - affected_metric
    - savings_bytes
    - savings_source
    - score_display_mode
    """
    base_columns = [
        "test_id",
        "opportunity_id",
        "title",
        "description",
        "savings_ms",
        "severity",
        "category",
        "details",
    ]

    optional_columns = [
        "affected_metric",
        "savings_bytes",
        "savings_source",
        "score_display_mode",
    ]

    columns = [
        column
        for column in base_columns + optional_columns
        if column in available_columns
    ]

    rows = []

    for opp in opportunities:
        row_values = []

        for column in columns:
            if column == "test_id":
                row_values.append(test_id)
            elif column == "details":
                row_values.append(
                    Json(opp.get("details"))
                    if opp.get("details") is not None
                    else None
                )
            else:
                row_values.append(opp.get(column))

        rows.append(tuple(row_values))

    return columns, rows


def insert_opportunities(
    conn,
    test_id: int,
    opportunities: List[Dict[str, Any]],
) -> int:
    """
    Insert Lighthouse opportunities for one test_id.

    Uses execute_batch for efficiency.
    Automatically adapts to optional columns.
    """
    if not opportunities:
        return 0

    opportunity_columns = get_table_columns(
        conn,
        "lighthouse_opportunities",
    )

    required = {
        "test_id",
        "opportunity_id",
        "title",
        "description",
        "savings_ms",
        "severity",
        "category",
        "details",
    }

    missing = required - opportunity_columns

    if missing:
        raise RuntimeError(
            "lighthouse_opportunities table missing required columns: "
            + ", ".join(sorted(missing))
        )

    columns, rows = build_opportunity_insert_rows(
        opportunities=opportunities,
        test_id=test_id,
        available_columns=opportunity_columns,
    )

    placeholders = ", ".join(["%s"] * len(columns))
    column_sql = ", ".join(columns)

    sql = f"""
        INSERT INTO lighthouse_opportunities (
            {column_sql}
        )
        VALUES (
            {placeholders}
        )
    """

    with conn.cursor() as cursor:
        execute_batch(
            cursor,
            sql,
            rows,
            page_size=100,
        )

    return len(rows)


# ─────────────────────────────────────────────
# Main load function
# ─────────────────────────────────────────────

def load(
    transformed: Dict[str, Any],
    raw_json: Dict[str, Any],
    metadata: Dict[str, Any],
    playwright_run_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Load one transformed Lighthouse result into DB.

    Returns:
        {
            "success": bool,
            "playwright_run_id": int,
            "test_id": int,
            "opportunity_count": int,
            "error": str | None
        }
    """
    conn = None

    try:
        conn = get_db_connection()
        conn.autocommit = False

        if playwright_run_id is None:
            playwright_run_id = create_playwright_run(
                conn,
                metadata,
            )

        test_id = insert_lighthouse_run(
            conn=conn,
            transformed=transformed,
            metadata=metadata,
            playwright_run_id=playwright_run_id,
        )

        insert_raw_report(
            conn=conn,
            test_id=test_id,
            raw_json=raw_json,
        )

        delete_opportunities_for_test(
            conn=conn,
            test_id=test_id,
        )

        opportunity_count = insert_opportunities(
            conn=conn,
            test_id=test_id,
            opportunities=transformed.get("opportunities", []),
        )

        conn.commit()

        print("✅ Loaded successfully!")
        print(f"   db:                {os.getenv('POSTGRES_DB')}")
        print(f"   playwright_run_id: {playwright_run_id}")
        print(f"   test_id:           {test_id}")
        print(f"   url:               {transformed.get('url')}")
        print(f"   performance:       {transformed.get('performance_score')}")
        print(f"   opportunities:     {opportunity_count}")

        return {
            "success": True,
            "playwright_run_id": playwright_run_id,
            "test_id": test_id,
            "opportunity_count": opportunity_count,
        }

    except Exception as e:
        if conn:
            conn.rollback()

        print(f"❌ Load failed: {e}")

        return {
            "success": False,
            "error": str(e),
        }

    finally:
        if conn:
            conn.close()