"""
db_client.py

Database helper functions for Remediation Agent runtime.

This module is responsible for:
1. Connecting to PostgreSQL
2. Reading Fix Plans approved by Dashboard
3. Reading patch changes for a Fix Plan
4. Updating Fix Plan status
"""

import os
from typing import Any, Dict, List, Optional

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv


load_dotenv()


def get_db_connection():
    """
    Create PostgreSQL connection using .env variables.

    Required .env values:
    - HOST_IP
    - PGPORT
    - POSTGRES_DB
    - POSTGRES_USER
    - POSTGRES_PASSWORD
    """
    return psycopg2.connect(

        host=os.getenv('HOST_IP'),
        port=os.getenv('PGPORT', '5432'),
        dbname=os.getenv('POSTGRES_DB'),
        user=os.getenv('POSTGRES_USER'),
        password=os.getenv('POSTGRES_PASSWORD')
    )


def get_next_approved_fix_plan() -> Optional[Dict[str, Any]]:
    """
    Get one Fix Plan that was approved from Dashboard.

    Dashboard should set:
        patch_status = 'approved_to_apply'

    Returns:
        dict if one approved Fix Plan exists
        None if no approved Fix Plan exists
    """
    conn = None

    try:
        conn = get_db_connection()

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    fp.id,
                    fp.thread_id,
                    fp.test_id,
                    fp.opportunity_id,
                    fp.action,
                    fp.reasoning,
                    fp.patch_code,
                    fp.problem_summary,
                    fp.priority_level,
                    fp.estimated_improvement,
                    fp.old_score,
                    fp.new_local_score,
                    fp.branch_name,
                    fp.pr_url,
                    fp.patch_status,
                    fp.risk_details,
                    fp.attempt_count,
                    fp.attempt_history,
                    lr.url,
                    lr.page_type,
                    lr.device_type,
                    lr.performance_score,
                    lr.lcp_ms,
                    lr.tbt_ms,
                    lr.cls_score
                FROM fix_plans fp
                LEFT JOIN lighthouse_runs lr
                    ON fp.test_id = lr.test_id
                WHERE fp.patch_status = 'approved_to_apply'
                ORDER BY fp.created_at ASC
                LIMIT 1
                """
            )

            row = cur.fetchone()
            return dict(row) if row else None

    finally:
        if conn:
            conn.close()


def get_fix_plan_changes(fix_plan_id: int) -> List[Dict[str, Any]]:
    """
    Get patch change list for a Fix Plan.

    Each row should contain:
    - target_file
    - original_code
    - suggested_code
    - change_type
    - change_reason
    """
    conn = None

    try:
        conn = get_db_connection()

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    id,
                    fix_plan_id,
                    target_file,
                    line_start,
                    line_end,
                    original_code,
                    suggested_code,
                    change_type,
                    change_reason
                FROM fix_plan_changes
                WHERE fix_plan_id = %s
                ORDER BY id ASC
                """,
                (fix_plan_id,),
            )

            rows = cur.fetchall()
            return [dict(row) for row in rows]

    finally:
        if conn:
            conn.close()


def update_fix_plan_status(
    fix_plan_id: int,
    status: str,
    error_message: Optional[str] = None,
) -> None:
    """
    Update patch_status of a Fix Plan.

    Example statuses:
    - approved_to_apply
    - applying
    - applied
    - local_test_running
    - local_test_passed
    - local_test_failed
    - approved_to_push
    - pr_created
    - failed
    """
    conn = None

    try:
        conn = get_db_connection()

        with conn.cursor() as cur:
            if error_message:
                cur.execute(
                    """
                    UPDATE fix_plans
                    SET
                        patch_status = %s,
                        rejection_reason = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (status, error_message, fix_plan_id),
                )
            else:
                cur.execute(
                    """
                    UPDATE fix_plans
                    SET
                        patch_status = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (status, fix_plan_id),
                )

        conn.commit()

    except Exception:
        if conn:
            conn.rollback()
        raise

    finally:
        if conn:
            conn.close()


def save_local_test_result(
    fix_plan_id: int,
    new_local_score: float,
    branch_name: Optional[str] = None,
) -> None:
    """
    Save local Lighthouse result after applying patch.

    This allows Dashboard to show:
    - old score
    - new local score
    - improvement
    """
    conn = None

    try:
        conn = get_db_connection()

        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE fix_plans
                SET
                    new_local_score = %s,
                    branch_name = COALESCE(%s, branch_name),
                    patch_status = 'local_test_passed',
                    updated_at = NOW()
                WHERE id = %s
                """,
                (new_local_score, branch_name, fix_plan_id),
            )

        conn.commit()

    except Exception:
        if conn:
            conn.rollback()
        raise

    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    fix_plan = get_next_approved_fix_plan()

    if not fix_plan:
        print("No approved Fix Plan found.")
    else:
        print("Approved Fix Plan found:")
        print(f"  id: {fix_plan['id']}")
        print(f"  thread_id: {fix_plan['thread_id']}")
        print(f"  test_id: {fix_plan['test_id']}")
        print(f"  status: {fix_plan['patch_status']}")
        print(f"  page_type: {fix_plan['page_type']}")
        print(f"  device_type: {fix_plan['device_type']}")
        print(f"  old_score: {fix_plan['old_score']}")

        changes = get_fix_plan_changes(fix_plan["id"])
        print(f"  patch changes: {len(changes)}")