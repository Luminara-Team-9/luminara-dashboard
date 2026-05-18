import os
import re
import json
import uuid
import argparse
from typing import TypedDict, Optional, Any

import psycopg2
import requests
from psycopg2.extras import Json
from dotenv import load_dotenv
from openai import OpenAI
from langgraph.graph import StateGraph, END

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
MAX_OPPORTUNITIES = int(os.getenv("MAX_OPPORTUNITIES", "1"))

client = OpenAI(
    base_url=QWEN_BASE_URL,
    api_key=os.getenv("QWEN_API_KEY", "dummy"),
)


def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("HOST_IP"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )


class AgentState(TypedDict, total=False):
    test_id: int

    url: str
    page_type: str
    device_type: str

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

    risk_score: int
    risk_details: dict

    fix_recommendation: dict
    fix_plan_id: Optional[int]

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


# ─────────────────────────────────────────────
# N1 — Get metrics + rank opportunities
# ─────────────────────────────────────────────

def get_metrics(state: AgentState) -> AgentState:
    print("\n[N1] Getting metrics and opportunities by test_id...")

    test_id = state.get("test_id")
    max_opportunities = state.get("max_opportunities", MAX_OPPORTUNITIES)

    if not test_id:
        print("  ❌ test_id is required. Listener must resolve it first.")
        return {**state, "should_end": True}

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT
            test_id,
            url,
            page_type,
            device_type,
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

    row = cursor.fetchone()

    if not row:
        conn.close()
        print(f"  ❌ No lighthouse_runs row found for test_id={test_id}")
        return {**state, "should_end": True}

    (
        selected_test_id,
        url,
        page_type,
        device_type,
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

    failed_metrics = []

    if performance_score is not None and performance_score < 90:
        failed_metrics.append("performance_score")
    if lcp_ms is not None and lcp_ms > 2500:
        failed_metrics.append("LCP")
    if tbt_ms is not None and tbt_ms > 200:
        failed_metrics.append("TBT")
    if cls_score is not None and cls_score > 0.1:
        failed_metrics.append("CLS")
    if inp_ms is not None and inp_ms > 200:
        failed_metrics.append("INP")

    if not failed_metrics:
        conn.close()
        print("  ✅ No failed metric detected. Agent stops.")
        return {**state, "should_end": True}

    confidence = "high" if len(failed_metrics) >= 2 else "medium"

    metrics = {
        "test_ids": [selected_test_id],
        "run_count": 1,
        "avg_lcp_ms": round(float(lcp_ms), 2) if lcp_ms is not None else None,
        "avg_tbt_ms": round(float(tbt_ms), 2) if tbt_ms is not None else None,
        "avg_cls_score": round(float(cls_score), 4) if cls_score is not None else None,
        "avg_performance": round(float(performance_score), 1) if performance_score is not None else None,
        "fcp_ms": round(float(fcp_ms), 2) if fcp_ms is not None else None,
        "si_ms": round(float(si_ms), 2) if si_ms is not None else None,
        "tti_ms": round(float(tti_ms), 2) if tti_ms is not None else None,
        "ttfb_ms": round(float(ttfb_ms), 2) if ttfb_ms is not None else None,
        "inp_ms": round(float(inp_ms), 2) if inp_ms is not None else None,
        "failed_metrics": failed_metrics,
    }

    cursor.execute(
        """
        SELECT
            lo.id,
            lo.opportunity_id,
            lo.title,
            lo.description,
            COALESCE(lo.savings_ms, 0)::int AS savings_ms,
            lo.severity,
            lo.category
        FROM lighthouse_opportunities lo
        WHERE lo.test_id = %s
          AND COALESCE(lo.savings_ms, 0) > 0
        ORDER BY
            COALESCE(lo.savings_ms, 0) DESC,
            CASE lo.severity
                WHEN 'high' THEN 3
                WHEN 'medium' THEN 2
                WHEN 'low' THEN 1
                ELSE 2
            END DESC,
            lo.created_at DESC
        LIMIT %s
        """,
        (selected_test_id, max_opportunities),
    )

    rows = cursor.fetchall()
    conn.close()

    opportunities = []

    for row in rows:
        opp_id, opportunity_id, title, description, savings_ms, severity, category = row

        severity = normalize_severity(severity)
        category = category or "performance"
        affected_metric = infer_affected_metric(title, category)
        priority_level = priority_from_savings(int(savings_ms or 0), severity)

        opportunities.append({
            "id": opp_id,
            "opportunity_id": opportunity_id,
            "title": title,
            "description": description,
            "avg_savings_ms": int(savings_ms or 0),
            "severity": severity,
            "category": category,
            "frequency": 1,
            "affected_metric": affected_metric,
            "priority_level": priority_level,
        })

    print(f"  ✅ test_id: {selected_test_id}")
    print(f"  ✅ URL: {url}")
    print(f"  ✅ Page: {page_type}")
    print(f"  ✅ Device: {device_type}")
    print(f"  ✅ Failed metrics: {failed_metrics}")
    print(f"  ✅ Opportunities selected: {len(opportunities)}")

    for opp in opportunities:
        print(
            f"     - {opp['title']} | "
            f"{opp['avg_savings_ms']}ms | "
            f"{opp['priority_level']} | "
            f"{opp['affected_metric']}"
        )

    if not opportunities:
        print("  ❌ No opportunities found. Run ETL first.")
        return {**state, "should_end": True}

    return {
        **state,
        "test_id": selected_test_id,
        "url": url,
        "page_type": page_type,
        "device_type": device_type,
        "metrics": metrics,
        "opportunities": opportunities,
        "confidence": confidence,
        "opp_index": 0,
        "should_end": False,
    }


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
            formatted.append(
                f"[Doc {i}] {doc.get('title')}\n"
                f"Type: {doc.get('doc_type')}\n"
                f"Similarity: {round(float(doc.get('similarity', 0)), 4)}\n"
                f"{doc.get('content')}"
            )

        rag_context = "\n\n".join(formatted)

        print(f"  ✅ RAG docs selected: {len(docs[:5])}")

    except Exception as e:
        print(f"  ⚠️ RAG service search failed: {e}")
        rag_context = ""

    return {**state, "rag_context": rag_context}


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
    risk_details["staged_self_healing"] = (
        "Only this priority fix should be applied first, then re-audit."
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
    print("\n[N5] Generating Fix Plan with Qwen...")

    opp = state["current_opp"]
    metrics = state["metrics"]
    rag_context = state.get("rag_context", "")
    patch_template = build_patch_template(opp["title"], opp["category"])

    prompt = f"""
You are a senior web performance optimization engineer for Korean e-commerce.

Generate ONE staged self-healing Fix Plan.
Important rule:
- Do NOT suggest fixing every issue at once.
- Only fix the selected highest-priority opportunity first.
- After this fix, the system will re-run Lighthouse and compare before/after scores.

Target audit:
- test_id: {state.get("test_id")}
- URL: {state.get("url")}
- Page type: {state.get("page_type")}
- Device: {state.get("device_type")}

Current failed metrics:
{json.dumps(metrics.get("failed_metrics", []), indent=2)}

Current metrics:
- Performance score: {metrics.get("avg_performance")}
- LCP: {metrics.get("avg_lcp_ms")}ms
- TBT: {metrics.get("avg_tbt_ms")}ms
- CLS: {metrics.get("avg_cls_score")}
- INP: {metrics.get("inp_ms")}ms
- TTFB: {metrics.get("ttfb_ms")}ms

Selected priority opportunity:
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
  "reasoning": "why this one fix should be applied first",
  "patch_code": {{
    "summary": "short patch summary",
    "before": "before example or null",
    "after": "after example or null"
  }},
  "problem_summary": "short dashboard-friendly problem summary",
  "impact_if_not_fixed": "impact if ignored",
  "impact_if_fixed": "expected improvement after this staged fix",
  "ux_improvement": "user experience benefit",
  "seo_impact": "SEO/Core Web Vitals benefit",
  "priority_level": "{opp.get("priority_level")}",
  "estimated_improvement": {opp.get("avg_savings_ms")},
  "affected_metric": "{opp.get("affected_metric")}",
  "target_file": "likely file/config area",
  "change_type": "server_config/javascript_optimization/css_optimization/image_optimization/network_optimization/performance_optimization",
  "next_step_after_patch": "rerun Lighthouse and compare new score with old_score"
}}
"""

    try:
        response = client.chat.completions.create(
            model=QWEN_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1200,
            temperature=0.1,
        )

        raw = response.choices[0].message.content.strip()
        fix_rec = extract_json(raw)

        print(f"  ✅ Qwen fix generated: {fix_rec.get('action', '')[:90]}")

    except Exception as e:
        print(f"  ⚠️ Qwen failed: {e}")
        print("  → Using fallback staged Fix Plan")

        fix_rec = {
            "action": f"Fix {opp['title']} to improve {opp['affected_metric']}",
            "reasoning": (
                f"This is the highest-priority opportunity for the current failed audit. "
                f"It targets {opp['affected_metric']} and is estimated to save "
                f"about {opp['avg_savings_ms']}ms."
            ),
            "patch_code": {
                "summary": patch_template["summary"],
                "before": patch_template["before"],
                "after": patch_template["after"],
            },
            "problem_summary": opp["title"],
            "impact_if_not_fixed": (
                f"{opp['affected_metric']} may remain poor, causing slower page load "
                "and weaker Lighthouse/Core Web Vitals performance."
            ),
            "impact_if_fixed": f"Expected improvement: about {opp['avg_savings_ms']}ms saved.",
            "ux_improvement": "Users can see and interact with the page faster.",
            "seo_impact": "Improves Lighthouse/Core Web Vitals quality signals.",
            "priority_level": opp.get("priority_level", "medium"),
            "estimated_improvement": opp["avg_savings_ms"],
            "affected_metric": opp["affected_metric"],
            "target_file": patch_template["target_file"],
            "change_type": patch_template["change_type"],
            "next_step_after_patch": "rerun Lighthouse and compare new score with old_score",
        }

    fix_rec.setdefault("patch_code", patch_template)
    fix_rec.setdefault("problem_summary", opp["title"])
    fix_rec.setdefault("priority_level", opp.get("priority_level", "medium"))
    fix_rec.setdefault("estimated_improvement", opp["avg_savings_ms"])
    fix_rec.setdefault("affected_metric", opp["affected_metric"])
    fix_rec.setdefault("target_file", patch_template["target_file"])
    fix_rec.setdefault("change_type", patch_template["change_type"])
    fix_rec.setdefault(
        "next_step_after_patch",
        "rerun Lighthouse and compare new score with old_score",
    )

    return {**state, "fix_recommendation": fix_rec}


# ─────────────────────────────────────────────
# N6 — Save Fix Plan
# ─────────────────────────────────────────────

def save_fix_plan(state: AgentState) -> AgentState:
    print("\n[N6] Saving Fix Plan...")

    fix_rec = state["fix_recommendation"]
    opp = state["current_opp"]
    metrics = state["metrics"]

    fix_plan_data = {
        "thread_id": state.get("thread_id") or str(uuid.uuid4()),
        "test_id": state["test_id"],
        "opportunity_id": opp["id"],
        "action": fix_rec.get("action", ""),
        "reasoning": fix_rec.get("reasoning", ""),
        "patch_code": fix_rec.get("patch_code"),
        "problem_summary": fix_rec.get("problem_summary"),
        "impact_if_not_fixed": fix_rec.get("impact_if_not_fixed"),
        "impact_if_fixed": fix_rec.get("impact_if_fixed"),
        "ux_improvement": fix_rec.get("ux_improvement"),
        "seo_impact": fix_rec.get("seo_impact"),
        "priority_level": fix_rec.get("priority_level", "medium"),
        "estimated_improvement": fix_rec.get("estimated_improvement", 0),
        "old_score": metrics.get("avg_performance"),
        "total_risk_score": state.get("risk_score", 0),
        "risk_details": state.get("risk_details", {}),
        "confidence_level": state.get("confidence", "medium"),
        "patch_status": "patch_generated",
        "attempt_count": 0,
        "attempt_history": [
            {
                "event": "fix_plan_generated",
                "test_id": state["test_id"],
                "opportunity_id": opp["id"],
                "next_step": fix_rec.get("next_step_after_patch"),
            }
        ],
        "branch_name": state.get("pr_branch"),
    }

    change_data = {
        "target_file": fix_rec.get("target_file", "unknown"),
        "line_start": None,
        "line_end": None,
        "original_code": None,
        "suggested_code": json.dumps(fix_rec.get("patch_code"), ensure_ascii=False),
        "change_type": fix_rec.get("change_type", "performance_optimization"),
        "change_reason": fix_rec.get("reasoning", ""),
    }

    if state.get("dry_run"):
        print("  🔍 DRY RUN — not saving")
        print(json.dumps(fix_plan_data, indent=2, default=str))
        return {
            **state,
            "fix_plan_id": None,
            "opp_index": state.get("opp_index", 0) + 1,
        }

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        fix_plan_id = safe_insert(
            cursor=cursor,
            table_name="fix_plans",
            data=fix_plan_data,
            returning="id",
        )

        change_data["fix_plan_id"] = fix_plan_id

        try:
            safe_insert(
                cursor=cursor,
                table_name="fix_plan_changes",
                data=change_data,
                returning="id",
            )
        except Exception as change_error:
            print(f"  ⚠️ fix_plan_changes skipped: {change_error}")

        conn.commit()
        print(f"  ✅ Saved fix_plan id={fix_plan_id}")

    except Exception as e:
        conn.rollback()
        print(f"  ❌ Save failed: {e}")
        fix_plan_id = None

    finally:
        conn.close()

    return {
        **state,
        "fix_plan_id": fix_plan_id,
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
    graph.add_edge("generate_fix", "save_fix_plan")

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
    })

    print("=" * 55)
    print("✅ Done")
    print(f"test_id:    {result.get('test_id')}")
    print(f"confidence: {result.get('confidence')}")
    print(f"processed:  {result.get('opp_index', 0)} opportunities")
    print("=" * 55)


if __name__ == "__main__":
    main()