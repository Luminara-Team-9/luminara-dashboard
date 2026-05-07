"""
load.py
Handles inserting processed Lighthouse data into luminara_phoo database.
Part of the ETL pipeline — runs after transform.py.

Tables affected: playwright_runs, lighthouse_runs,
                 lighthouse_raw_reports, lighthouse_opportunities
"""

import os
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv

load_dotenv()


def get_db_connection():
    """
    Connect to luminara_phoo database.
    Credentials are read from .env file.

    ⚠️ Set DB_USER to your Linux username in .env
    ( — Singularity uses Linux permissions)
    """
    return psycopg2.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        port=os.getenv('DB_PORT', '5432'),
        dbname=os.getenv('DB_NAME', 'luminara_phoo'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD', '')
    )


def create_playwright_run(conn, run_type='decathlon_daily'):
    """
    Start a new session record in playwright_runs.
    Returns playwright_run_id used to link all test runs in this session.
    """
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO playwright_runs (
            run_type, started_at, status
        ) VALUES (%s, NOW(), 'running')
        RETURNING id
    """, (run_type,))
    return cursor.fetchone()[0]


def update_playwright_run(conn, playwright_run_id,
                          success_count, failed_count):
    """
    Update session status when ETL finishes.
    Status: 'completed', 'partial', or 'failed'
    """
    cursor = conn.cursor()

    if failed_count == 0:
        status = 'completed'
    elif success_count == 0:
        status = 'failed'
    else:
        status = 'partial'

    cursor.execute("""
        UPDATE playwright_runs
        SET finished_at = NOW(),
            total_tests = %s,
            success_count = %s,
            failed_count = %s,
            status = %s
        WHERE id = %s
    """, (
        success_count + failed_count,
        success_count,
        failed_count,
        status,
        playwright_run_id
    ))


def insert_lighthouse_run(conn, transformed, metadata,
                          playwright_run_id):
    """
    Insert one page test's metrics into lighthouse_runs.
    Metadata comes from Phoo's automation.
    Metrics come from transform.py.
    Returns test_id to link raw_reports and opportunities.
    """
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
            total_requests, page_size_kb, js_size_kb
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s
        )
        RETURNING test_id
    """, (
        playwright_run_id,
        transformed['url'],
        metadata['site_type'],
        metadata.get('competitor_name', None),
        metadata['page_type'],
        metadata['device_type'],
        metadata.get('network_profile', None),
        metadata['run_number'],
        transformed['timestamp'],
        transformed['lcp_ms'],
        transformed['tbt_ms'],
        transformed['cls_score'],
        transformed['fcp_ms'],
        transformed['si_ms'],
        transformed['tti_ms'],
        transformed['ttfb_ms'],
        transformed['inp_ms'],
        transformed['performance_score'],
        transformed['accessibility_score'],
        transformed['best_practices_score'],
        transformed['seo_score'],
        transformed['total_requests'],
        transformed['page_size_kb'],
        transformed['js_size_kb']
    ))
    return cursor.fetchone()[0]


def insert_raw_report(conn, test_id, raw_json):
    """
    Store complete raw Lighthouse JSON.
    Kept for re-processing later without re-running audits.
    """
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO lighthouse_raw_reports (
            test_id, raw_json
        ) VALUES (%s, %s)
    """, (test_id, Json(raw_json)))


def insert_opportunities(conn, test_id, opportunities):
    """
    Insert fixable performance issues found by Lighthouse.
    Already sorted highest savings_ms first by transform.py.
    RA uses these to decide what to fix first.
    """
    cursor = conn.cursor()
    for opp in opportunities:
        cursor.execute("""
            INSERT INTO lighthouse_opportunities (
                test_id, opportunity_id, title,
                description, savings_ms, severity
            ) VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            test_id,
            opp['opportunity_id'],
            opp['title'],
            opp['description'],
            opp['savings_ms'],
            opp['severity']
        ))


def load(transformed, raw_json, metadata,
         playwright_run_id=None):
    """
    Main load function — runs all inserts in one transaction.
    If anything fails → everything rolls back, no partial data.

    Args:
        transformed:       clean metrics from transform.py
        raw_json:          original Lighthouse JSON
        metadata:          site info from Phoo's automation
        playwright_run_id: pass existing ID to continue
                          a session, or None to start new

    Returns:
        dict with success, playwright_run_id, test_id
    """
    conn = None
    try:
        conn = get_db_connection()

        if playwright_run_id is None:
            playwright_run_id = create_playwright_run(
                conn,
                metadata.get('run_type', 'decathlon_daily')
            )

        test_id = insert_lighthouse_run(
            conn, transformed, metadata, playwright_run_id
        )
        insert_raw_report(conn, test_id, raw_json)
        insert_opportunities(
            conn, test_id, transformed['opportunities']
        )

        conn.commit()

        print(f"✅ Loaded successfully!")
        print(f"   database: {os.getenv('DB_NAME', 'luminara_phoo')}")
        print(f"   playwright_run_id: {playwright_run_id}")
        print(f"   test_id: {test_id}")
        print(f"   opportunities: {len(transformed['opportunities'])}")

        return {
            'playwright_run_id': playwright_run_id,
            'test_id': test_id,
            'success': True
        }

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"❌ Load failed: {e}")
        return {'success': False, 'error': str(e)}

    finally:
        if conn:
            conn.close()