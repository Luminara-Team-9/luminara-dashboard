"""
load.py
Inserts processed Lighthouse data into core_db.
"""

import os
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv

load_dotenv()


def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("HOST_IP", "127.0.0.1"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )


def create_playwright_run(conn, metadata):
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO playwright_runs (
            run_type, url, device_type, started_at, status
        ) VALUES (%s, %s, %s, NOW(), 'running')
        RETURNING id
    """, (
        metadata.get("run_type"),
        metadata.get("url"),
        metadata.get("device_type"),
    ))
    return cursor.fetchone()[0]


def update_playwright_run(conn, playwright_run_id, success_count, failed_count):
    cursor = conn.cursor()

    if failed_count == 0:
        status = "completed"
    elif success_count == 0:
        status = "failed"
    else:
        status = "partial"

    cursor.execute("""
        UPDATE playwright_runs
        SET finished_at    = NOW(),
            total_tests    = %s,
            success_count  = %s,
            failed_count   = %s,
            status         = %s
        WHERE id = %s
    """, (
        success_count + failed_count,
        success_count,
        failed_count,
        status,
        playwright_run_id,
    ))


def insert_lighthouse_run(conn, transformed, metadata, playwright_run_id):
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO lighthouse_runs (
            playwright_run_id,
            url, site_type, competitor_name,
            page_type, device_type, network_profile,
            run_number, timestamp,
            lcp_ms, tbt_ms, cls_score, fcp_ms,
            si_ms, tti_ms, ttfb_ms, inp_ms,
            performance_score, accessibility_score,
            best_practices_score, seo_score,
            total_requests, page_size_kb,
            js_size_kb, css_size_kb, image_size_kb
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s, %s
        )
        RETURNING test_id
    """, (
        playwright_run_id,
        transformed["url"],
        metadata["site_type"],
        metadata.get("competitor_name"),
        metadata["page_type"],
        metadata["device_type"],
        metadata.get("network_profile"),
        metadata["run_number"],
        transformed["timestamp"],
        transformed["lcp_ms"],
        transformed["tbt_ms"],
        transformed["cls_score"],
        transformed["fcp_ms"],
        transformed["si_ms"],
        transformed["tti_ms"],
        transformed["ttfb_ms"],
        transformed["inp_ms"],
        transformed["performance_score"],
        transformed["accessibility_score"],
        transformed["best_practices_score"],
        transformed["seo_score"],
        transformed["total_requests"],
        transformed["page_size_kb"],
        transformed["js_size_kb"],
        transformed["css_size_kb"],
        transformed["image_size_kb"],
    ))
    return cursor.fetchone()[0]


def insert_raw_report(conn, test_id, raw_json):
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO lighthouse_raw_reports (
            test_id, raw_json
        ) VALUES (%s, %s)
    """, (test_id, Json(raw_json)))


def delete_opportunities_for_test(conn, test_id):
    """
    Delete existing opportunities for one test_id.
    Needed before reprocessing the same Lighthouse report.
    """
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM lighthouse_opportunities WHERE test_id = %s",
        (test_id,),
    )


def insert_opportunities(conn, test_id, opportunities):
    cursor = conn.cursor()

    for opp in opportunities:
        cursor.execute("""
            INSERT INTO lighthouse_opportunities (
                test_id, opportunity_id,
                title, description,
                savings_ms, severity,
                category, details
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s, %s, %s
            )
        """, (
            test_id,
            opp["opportunity_id"],
            opp["title"],
            opp["description"],
            opp["savings_ms"],
            opp["severity"],
            opp["category"],
            Json(opp["details"]) if opp.get("details") else None,
        ))


def load(transformed, raw_json, metadata, playwright_run_id=None):
    conn = None

    try:
        conn = get_db_connection()

        if playwright_run_id is None:
            playwright_run_id = create_playwright_run(conn, metadata)

        test_id = insert_lighthouse_run(
            conn,
            transformed,
            metadata,
            playwright_run_id,
        )

        insert_raw_report(conn, test_id, raw_json)

        insert_opportunities(
            conn,
            test_id,
            transformed["opportunities"],
        )

        conn.commit()

        print("✅ Loaded successfully!")
        print(f"   db:                {os.getenv('POSTGRES_DB')}")
        print(f"   playwright_run_id: {playwright_run_id}")
        print(f"   test_id:           {test_id}")
        print(f"   url:               {transformed['url']}")
        print(f"   performance:       {transformed['performance_score']}")
        print(f"   opportunities:     {len(transformed['opportunities'])}")

        return {
            "playwright_run_id": playwright_run_id,
            "test_id": test_id,
            "success": True,
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