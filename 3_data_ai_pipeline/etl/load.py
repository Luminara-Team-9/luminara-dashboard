"""
load.py
Loads transformed Lighthouse data into PostgreSQL

Flow:
    transform.py output (clean dict)
            ↓
    load(transformed, raw_json, metadata)
            ↓
    PostgreSQL tables:
    → playwright_runs
    → lighthouse_runs
    → lighthouse_raw_reports
    → lighthouse_opportunities
"""

import os
import json
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv

load_dotenv()


def get_db_connection():
    """
    Create and return PostgreSQL connection
    Uses .env variables for credentials

    LOCAL:      connects to local PostgreSQL
    PRODUCTION: connects to NAS PostgreSQL
    → only .env changes, code stays same ✅
    """
    return psycopg2.connect(
        host=os.getenv('HOST_IP', 'localhost'),
        port=os.getenv('PGPORT', '5432'),
        dbname=os.getenv('POSTGRES_DB', 'luminara_dev'),
        user=os.getenv('POSTGRES_USER', 'postgres'),
        password=os.getenv('POSTGRES_PASSWORD', '')
    )
    # psycopg2.connect = open connection to PostgreSQL
    # os.getenv() = read value from .env file
    # second argument = default value if not found in .env


def create_playwright_run(conn, run_type='decathlon_daily'):
    """
    Insert a new playwright session record
    Input:  conn = database connection
            run_type = type of run
    Output: id of created playwright_run row

    Called ONCE per ETL session
    All lighthouse_runs in this session
    will reference this playwright_run_id
    """
    cursor = conn.cursor()
    # cursor = tool to execute SQL commands

    cursor.execute("""
        INSERT INTO playwright_runs (
            run_type,
            started_at,
            status
        ) VALUES (
            %s,
            NOW(),
            'running'
        )
        RETURNING id
    """, (run_type,))
    # %s = placeholder for value
    #      prevents SQL injection
    # NOW() = current timestamp
    # RETURNING id = give back the
    #               auto-generated id

    playwright_run_id = cursor.fetchone()[0]
    # fetchone() = get first row of result
    # [0] = get first column (the id)

    return playwright_run_id


def update_playwright_run(conn, playwright_run_id,
                          success_count, failed_count):
    """
    Update playwright_run status when ETL finishes
    Input:  conn = database connection
            playwright_run_id = id to update
            success_count = how many tests succeeded
            failed_count = how many tests failed
    """
    cursor = conn.cursor()

    # determine overall status
    if failed_count == 0:
        status = 'completed'
        # all tests passed ✅
    elif success_count == 0:
        status = 'failed'
        # all tests failed ❌
    else:
        status = 'partial'
        # some passed, some failed ⚠️

    cursor.execute("""
        UPDATE playwright_runs
        SET
            finished_at = NOW(),
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
    # UPDATE = modify existing row
    # SET = which columns to change
    # WHERE id = %s = which row to update


def insert_lighthouse_run(conn, transformed, metadata,
                          playwright_run_id):
    """
    Insert transformed metrics into lighthouse_runs table
    Input:  conn = database connection
            transformed = clean dict from transform.py
            metadata = dict with site info from Phoo
                       (site_type, page_type etc.)
            playwright_run_id = links to playwright session
    Output: test_id of created row
    """
    cursor = conn.cursor()

    cursor.execute("""
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
            js_size_kb
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

    test_id = cursor.fetchone()[0]
    return test_id


def insert_raw_report(conn, test_id, raw_json):
    """
    Insert raw Lighthouse JSON into lighthouse_raw_reports
    Input:  conn = database connection
            test_id = links to lighthouse_runs row
            raw_json = original Lighthouse JSON dict
    """
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO lighthouse_raw_reports (
            test_id,
            raw_json
        ) VALUES (%s, %s)
    """, (
        test_id,
        Json(raw_json)
        # Json() = converts Python dict to PostgreSQL JSONB
        # psycopg2.extras.Json handles this conversion
    ))


def insert_opportunities(conn, test_id, opportunities):
    """
    Insert all opportunities into lighthouse_opportunities
    Input:  conn = database connection
            test_id = links to lighthouse_runs row
            opportunities = list from transform.py
    """
    cursor = conn.cursor()

    for opp in opportunities:
        cursor.execute("""
            INSERT INTO lighthouse_opportunities (
                test_id,
                opportunity_id,
                title,
                description,
                savings_ms,
                severity
            ) VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            test_id,
            opp['opportunity_id'],
            opp['title'],
            opp['description'],
            opp['savings_ms'],
            opp['severity']
        ))
        # loop inserts one row per opportunity
        # each row links to same test_id


def load(transformed, raw_json, metadata,
         playwright_run_id=None):
    """
    Main load function — inserts all data into PostgreSQL
    Input:  transformed = clean dict from transform.py
            raw_json = original Lighthouse JSON dict
            metadata = site info (site_type, page_type etc.)
            playwright_run_id = existing session id
                                (None = create new session)
    Output: dict with inserted IDs

    Uses transaction:
    → if anything fails → rollback everything
    → no partial data in database
    """
    conn = None
    # conn = None = no connection yet

    try:
        # open connection to PostgreSQL
        conn = get_db_connection()

        # create playwright_run if not provided
        if playwright_run_id is None:
            playwright_run_id = create_playwright_run(
                conn,
                metadata.get('run_type', 'decathlon_daily')
            )

        # insert main metrics row
        test_id = insert_lighthouse_run(
            conn, transformed, metadata, playwright_run_id
        )

        # insert raw JSON
        insert_raw_report(conn, test_id, raw_json)

        # insert all opportunities
        insert_opportunities(
            conn, test_id, transformed['opportunities']
        )

        # commit = save all changes to database
        # if we reach here = everything worked ✅
        conn.commit()

        print(f"✅ Loaded successfully!")
        print(f"   playwright_run_id: {playwright_run_id}")
        print(f"   test_id: {test_id}")
        print(f"   opportunities: "
              f"{len(transformed['opportunities'])}")

        return {
            'playwright_run_id': playwright_run_id,
            'test_id': test_id,
            'success': True
        }

    except Exception as e:
        # something went wrong
        if conn:
            conn.rollback()
            # rollback = undo ALL changes
            # database stays clean
            # no partial data ✅
        print(f"❌ Load failed: {e}")
        return {
            'success': False,
            'error': str(e)
        }

    finally:
        # finally = always runs
        # even if error occurred
        if conn:
            conn.close()
            # always close connection
            # prevents connection leaks