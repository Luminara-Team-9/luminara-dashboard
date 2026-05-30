"""
db_client.py

Production-ready database helper functions for Remediation Agent runtime.

This module is responsible for:
1. Connecting to PostgreSQL.
2. Atomically claiming one Dashboard-approved Fix Plan.
3. Reading patch changes for a Fix Plan.
4. Updating Fix Plan and Fix Plan Change statuses.
5. Saving local verification results.

Important:
- This module does NOT generate Fix Plans.
- This module does NOT apply patches.
- apply_patch.py should use this module after Dashboard approval.
"""

import os
from typing import Any, Dict, List, Optional

import psycopg2
from psycopg2.extras import RealDictCursor, Json
from dotenv import load_dotenv


load_dotenv()


VALID_FIX_PLAN_STATUSES = {
    "pending_review",
    "queued",
    "requires_human_review",
    "approved_to_apply",
    "applying",
    "applied",
    "patch_applied",
    "apply_failed",
    "build_testing",
    "build_failed",
    "pushed",
    "push_failed",
    "local_test_running",
    "local_test_passed",
    "local_test_failed",
    "approved_to_push",
    "pr_created",
    "failed",
    "rejected",
}


VALID_CHANGE_STATUSES = {
    "pending",
    "applying",
    "applied",
    "failed",
    "skipped",
}


def get_db_connection():
    """
    Create PostgreSQL connection using .env variables.

    Required .env values:
    - HOST_IP
    - PGPORT
    - POSTGRES_DB
    - POSTGRES_USER
    - POSTGRES_PASSWORD

    Note:
    HOST_IP may be a host name, IP address, or Unix socket directory,
    depending on your PostgreSQL container setup.
    """
    return psycopg2.connect(
        host=os.getenv("HOST_IP"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )


def get_lhci_connection():
    """
    Create PostgreSQL connection to the LHCI database.
    Same host/port/credentials as core_db, different dbname.
    """
    return psycopg2.connect(
        host=os.getenv("HOST_IP"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("LHCI_DB", "lhci"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )


def append_attempt_history_sql(
    cur,
    fix_plan_id: int,
    event: Dict[str, Any],
) -> None:
    """
    Append one event object to fix_plans.attempt_history JSONB array.

    Works even if attempt_history is NULL.
    """
    cur.execute(
        """
        UPDATE fix_plans
        SET
            attempt_history =
                COALESCE(attempt_history::jsonb, '[]'::jsonb)
                || %s::jsonb,
            updated_at = NOW()
        WHERE id = %s
        """,
        (Json([event]), fix_plan_id),
    )


def claim_next_approved_fix_plan(
    worker_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Atomically claim one Fix Plan approved by Dashboard.

    Dashboard should set:
        patch_status = 'approved_to_apply'

    This function:
    1. SELECTs one approved row.
    2. Locks it with FOR UPDATE SKIP LOCKED.
    3. Immediately changes patch_status to 'applying'.
    4. Returns the claimed Fix Plan.

    This prevents two workers from applying the same Fix Plan.

    Returns:
        dict if one approved Fix Plan was claimed
        None if no approved Fix Plan exists
    """
    conn = None

    worker = worker_id or os.getenv("HOSTNAME") or "unknown_worker"

    try:
        conn = get_db_connection()
        conn.autocommit = False

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                WITH next_plan AS (
                    SELECT fp.id
                    FROM fix_plans fp
                    WHERE fp.patch_status = 'approved_to_apply'
                    ORDER BY
                        fp.priority_level DESC NULLS LAST,
                        fp.created_at ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                UPDATE fix_plans fp
                SET
                    patch_status = 'applying',
                    updated_at = NOW()
                FROM next_plan
                WHERE fp.id = next_plan.id
                RETURNING
                    fp.id,
                    fp.thread_id,
                    fp.opportunity_id,
                    fp.action,
                    fp.reasoning,
                    fp.patch_code,
                    fp.problem_summary,
                    fp.priority_level,
                    fp.estimated_improvement,
                    fp.old_score,
                    fp.branch_name,
                    fp.pr_url,
                    fp.patch_status,
                    fp.attempt_history,
                    fp.page_type,
                    fp.device_type,
                    fp.site_type,
                    fp.queue_rank,
                    fp.total_queue_items,
                    fp.run_frequency,
                    fp.workspace_path,
                    fp.lhci_build_id,
                    fp.auto_applicable,
                    fp.failed_metrics,
                    fp.failed_metric_counts
                """
            )

            row = cur.fetchone()

            if not row:
                conn.commit()
                return None

            fix_plan = dict(row)

            append_attempt_history_sql(
                cur,
                fix_plan_id=fix_plan["id"],
                event={
                    "event": "fix_plan_claimed_for_apply",
                    "worker_id": worker,
                    "patch_status": "applying",
                },
            )

        conn.commit()
        return fix_plan

    except Exception:
        if conn:
            conn.rollback()
        raise

    finally:
        if conn:
            conn.close()


def get_next_approved_fix_plan() -> Optional[Dict[str, Any]]:
    """
    Backward-compatible wrapper.

    Older apply_patch.py may call get_next_approved_fix_plan().
    For production safety, this now claims the row atomically.
    """
    return claim_next_approved_fix_plan()


def get_fix_plan_by_id(fix_plan_id: int) -> Optional[Dict[str, Any]]:
    """
    Read one Fix Plan by ID without claiming it.

    Useful for:
    - dashboard detail view
    - dry-run apply
    - debugging
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
                    fp.attempt_history,
                    fp.approved_by,
                    fp.page_type,
                    fp.device_type,
                    fp.site_type,
                    fp.queue_rank,
                    fp.total_queue_items,
                    fp.run_frequency,
                    fp.workspace_path,
                    fp.lhci_build_id,
                    fp.auto_applicable,
                    fp.failed_metrics,
                    fp.failed_metric_counts,
                    fp.build_status,
                    fp.audit_status,
                    fp.created_at,
                    fp.updated_at
                FROM fix_plans fp
                WHERE fp.id = %s
                """,
                (fix_plan_id,),
            )

            row = cur.fetchone()
            return dict(row) if row else None

    finally:
        if conn:
            conn.close()


def get_fix_plan_changes(
    fix_plan_id: int,
    only_pending: bool = True,
) -> List[Dict[str, Any]]:
    """
    Get patch change list for a Fix Plan.

    By default, returns only pending changes so the same patch is not
    accidentally applied twice.

    Each row contains:
    - target_file
    - original_code
    - suggested_code
    - change_type
    - change_reason
    - apply_status
    - backup_path
    """
    conn = None

    try:
        conn = get_db_connection()

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if only_pending:
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
                        change_reason,
                        apply_status,
                        backup_path,
                        created_at
                    FROM fix_plan_changes
                    WHERE fix_plan_id = %s
                      AND COALESCE(apply_status, 'pending') = 'pending'
                    ORDER BY id ASC
                    """,
                    (fix_plan_id,),
                )
            else:
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
                        change_reason,
                        apply_status,
                        backup_path,
                        created_at
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
    extra_event: Optional[Dict[str, Any]] = None,
    approved_by: Optional[str] = None,
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

    approved_by: who approved this fix plan (e.g. 'dashboard', 'cli').
    Only written on the approved_to_apply transition; other callers leave it None.
    """
    if status not in VALID_FIX_PLAN_STATUSES:
        raise ValueError(f"Invalid fix_plan status: {status}")

    conn = None

    try:
        conn = get_db_connection()
        conn.autocommit = False

        with conn.cursor() as cur:
            if error_message:
                cur.execute(
                    """
                    UPDATE fix_plans
                    SET
                        patch_status = %s,
                        rejection_reason = %s,
                        approved_by = COALESCE(%s, approved_by),
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (status, error_message, approved_by, fix_plan_id),
                )
            else:
                cur.execute(
                    """
                    UPDATE fix_plans
                    SET
                        patch_status = %s,
                        approved_by = COALESCE(%s, approved_by),
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (status, approved_by, fix_plan_id),
                )

            event = {
                "event": "fix_plan_status_updated",
                "patch_status": status,
            }

            if approved_by:
                event["approved_by"] = approved_by

            if error_message:
                event["error_message"] = error_message

            if extra_event:
                event.update(extra_event)

            append_attempt_history_sql(cur, fix_plan_id, event)

        conn.commit()

    except Exception:
        if conn:
            conn.rollback()
        raise

    finally:
        if conn:
            conn.close()


def update_fix_plan_change_status(
    change_id: int,
    apply_status: str,
    backup_path: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    """
    Update apply_status of one fix_plan_changes row.

    Example statuses:
    - pending
    - applying
    - applied
    - failed
    - skipped
    """
    if apply_status not in VALID_CHANGE_STATUSES:
        raise ValueError(f"Invalid change apply_status: {apply_status}")

    conn = None

    try:
        conn = get_db_connection()

        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE fix_plan_changes
                SET
                    apply_status = %s,
                    backup_path = COALESCE(%s, backup_path)
                WHERE id = %s
                """,
                (apply_status, backup_path, change_id),
            )

            if error_message:
                # Store change-level failure reason in parent fix plan history.
                cur.execute(
                    """
                    SELECT fix_plan_id
                    FROM fix_plan_changes
                    WHERE id = %s
                    """,
                    (change_id,),
                )
                row = cur.fetchone()

                if row:
                    fix_plan_id = row[0]
                    append_attempt_history_sql(
                        cur,
                        fix_plan_id,
                        {
                            "event": "fix_plan_change_status_updated",
                            "change_id": change_id,
                            "apply_status": apply_status,
                            "error_message": error_message,
                        },
                    )

        conn.commit()

    except Exception:
        if conn:
            conn.rollback()
        raise

    finally:
        if conn:
            conn.close()


def mark_all_changes_status(
    fix_plan_id: int,
    apply_status: str,
    error_message: Optional[str] = None,
) -> None:
    """
    Update all changes for a Fix Plan.

    Useful when apply_patch.py fails before applying individual changes.
    """
    if apply_status not in VALID_CHANGE_STATUSES:
        raise ValueError(f"Invalid change apply_status: {apply_status}")

    conn = None

    try:
        conn = get_db_connection()
        conn.autocommit = False

        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE fix_plan_changes
                SET apply_status = %s
                WHERE fix_plan_id = %s
                  AND COALESCE(apply_status, 'pending') IN ('pending', 'applying')
                """,
                (apply_status, fix_plan_id),
            )

            event = {
                "event": "all_fix_plan_changes_status_updated",
                "apply_status": apply_status,
            }

            if error_message:
                event["error_message"] = error_message

            append_attempt_history_sql(cur, fix_plan_id, event)

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
    new_local_score: Optional[float],
    passed: bool,
    branch_name: Optional[str] = None,
    error_message: Optional[str] = None,
    build_status: Optional[str] = None,
    audit_status: Optional[str] = None,
) -> None:
    """
    Save local verification result after applying patch.

    Allows Dashboard to show:
    - old score
    - new local score
    - improvement
    - local test status
    """
    conn = None
    patch_status = "local_test_passed" if passed else "local_test_failed"

    try:
        conn = get_db_connection()
        conn.autocommit = False

        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE fix_plans
                SET
                    new_local_score = COALESCE(%s, new_local_score),
                    branch_name = COALESCE(%s, branch_name),
                    build_status = COALESCE(%s, build_status),
                    audit_status = COALESCE(%s, audit_status),
                    patch_status = %s,
                    rejection_reason = CASE
                        WHEN %s IS NOT NULL THEN %s
                        ELSE rejection_reason
                    END,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    new_local_score,
                    branch_name,
                    build_status,
                    audit_status,
                    patch_status,
                    error_message,
                    error_message,
                    fix_plan_id,
                ),
            )

            append_attempt_history_sql(
                cur,
                fix_plan_id,
                {
                    "event": "local_test_result_saved",
                    "patch_status": patch_status,
                    "passed": passed,
                    "new_local_score": new_local_score,
                    "branch_name": branch_name,
                    "build_status": build_status,
                    "audit_status": audit_status,
                    "error_message": error_message,
                },
            )

        conn.commit()

    except Exception:
        if conn:
            conn.rollback()
        raise

    finally:
        if conn:
            conn.close()


def get_fix_plans_list(
    limit: int = 50,
    page_type: Optional[str] = None,
    device_type: Optional[str] = None,
    patch_status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Return a list of fix plans for the dashboard.
    Supports optional filtering by page_type, device_type, patch_status.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            filters = []
            params: list = []
            if page_type:
                filters.append("page_type = %s")
                params.append(page_type)
            if device_type:
                filters.append("device_type = %s")
                params.append(device_type)
            if patch_status:
                filters.append("patch_status = %s")
                params.append(patch_status)

            where = f"WHERE {' AND '.join(filters)}" if filters else ""
            params.append(limit)

            cur.execute(
                f"""
                SELECT
                    id,
                    thread_id,
                    page_type,
                    device_type,
                    site_type,
                    action,
                    problem_summary,
                    priority_level,
                    estimated_improvement,
                    old_score,
                    new_local_score,
                    patch_status,
                    approved_by,
                    branch_name,
                    queue_rank,
                    total_queue_items,
                    (patch_code::jsonb->>'auto_applicable')::boolean AS auto_applicable,
                    created_at,
                    updated_at
                FROM fix_plans
                {where}
                ORDER BY created_at DESC
                LIMIT %s
                """,
                params,
            )
            rows = cur.fetchall()
            return [dict(row) for row in rows]
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    fix_plan = get_next_approved_fix_plan()

    if not fix_plan:
        print("No approved Fix Plan found.")
    else:
        print("Approved Fix Plan claimed:")
        print(f"  id: {fix_plan['id']}")
        print(f"  thread_id: {fix_plan['thread_id']}")
        print(f"  lhci_build_id: {fix_plan.get('lhci_build_id')}")
        print(f"  status: {fix_plan['patch_status']}")
        print(f"  page_type: {fix_plan['page_type']}")
        print(f"  device_type: {fix_plan['device_type']}")
        print(f"  old_score: {fix_plan['old_score']}")
        print(f"  workspace_path: {fix_plan.get('workspace_path')}")

        changes = get_fix_plan_changes(fix_plan["id"])
        print(f"  pending patch changes: {len(changes)}")