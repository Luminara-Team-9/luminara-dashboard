import os
import re
import json
import uuid
import argparse
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv
from openai import OpenAI
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional, Any
from sentence_transformers import SentenceTransformer

load_dotenv()

# ── Config ───────────────────────────────────────────────────────────────────
# vLLM/Qwen runs on DIS02 GPU server.
# Agent/listener runs on ABRM02 and calls DIS02 through OpenAI-compatible API.

QWEN_MODEL = os.getenv(
    "QWEN_MODEL",
    "/abr/coss41/shared_workspace/yuyu_workspace/data/models/qwen32b-int4",
)

QWEN_BASE_URL = os.getenv(
    "QWEN_BASE_URL",
    "http://DIS02:8000/v1",
)

MAX_OPPORTUNITIES = int(os.getenv("MAX_OPPORTUNITIES", "5"))

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


_embed_model = None


def get_embed_model():
    """
    Load BGE-M3 only once per running listener/agent process.
    This avoids reloading the embedding model on every trigger.
    """
    global _embed_model

    if _embed_model is None:
        print("Loading BGE-M3...")
        _embed_model = SentenceTransformer("BAAI/bge-m3")
        print("✅ BGE-M3 loaded")

    return _embed_model


class AgentState(TypedDict):
    url: str
    page_type: str
    device_type: str
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


# ── Helpers ──────────────────────────────────────────────────────────────────

def normalize_title(title: str) -> str:
    title = title or ""
    title = re.sub(r"\s+", " ", title.strip().lower())
    return title


def normalize_severity(severity: Optional[str]) -> str:
    severity = (severity or "").lower()

    if severity in {"high", "medium", "low"}:
        return severity

    return "medium"


def severity_rank(severity: Optional[str]) -> int:
    severity = normalize_severity(severity)
    return {"low": 1, "medium": 2, "high": 3}.get(severity, 2)


def priority_from_savings(avg_savings_ms: int, severity: Optional[str]) -> str:
    sev = normalize_severity(severity)

    if sev == "high" or avg_savings_ms >= 500:
        return "high"

    if sev == "medium" or avg_savings_ms >= 150:
        return "medium"

    return "low"


def infer_affected_metric(title: str, category: str) -> str:
    text = f"{title} {category}".lower()

    if "lcp" in text or "largest contentful paint" in text or "image" in text:
        return "LCP"

    if (
        "tbt" in text
        or "javascript" in text
        or "js" in text
        or "main thread" in text
    ):
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
            "after": "Add CDN/server caching, optimize backend query, and reduce TTFB for HTML document.",
        }

    if (
        "unused javascript" in text
        or "legacy javascript" in text
        or "js" in text
        or "javascript" in text
    ):
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

    if (
        "image" in text
        or "next-gen" in text
        or "properly size" in text
        or "offscreen" in text
    ):
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
        "after": "Apply the recommended optimization and verify with Lighthouse rerun.",
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


# ── N1: Get latest 3-run metrics + aggregated opportunities ──────────────────

def get_metrics(state: AgentState) -> AgentState:
    """
    N1 purpose:
    - Select latest daily Lighthouse runs for same URL + page_type + device_type.
    - Use up to 3 runs because Lighthouse is repeated 3 times per page/device.
    - Average metrics for stable judgment.
    - Aggregate opportunities only from those selected test_ids.
    """

    print("\n[N1] Getting metrics...")

    url = state["url"].rstrip("/")
    page_type = state["page_type"]
    device_type = state["device_type"]
    max_opportunities = state.get("max_opportunities", MAX_OPPORTUNITIES)

    conn = get_db_connection()
    cursor = conn.cursor()

    # Pick latest daily group.
    # Example:
    # main + desktop has 3 runs today.
    # We select those 3 latest same-day runs and average them.
    cursor.execute(
        """
        WITH candidate_runs AS (
            SELECT
                test_id,
                lcp_ms,
                tbt_ms,
                cls_score,
                performance_score,
                timestamp,
                created_at,
                DATE(COALESCE(timestamp, created_at)) AS run_date,
                run_number
            FROM lighthouse_runs
            WHERE TRIM(TRAILING '/' FROM url) = %s
              AND page_type = %s
              AND device_type = %s
        ),
        latest_day AS (
            SELECT MAX(run_date) AS run_date
            FROM candidate_runs
        )
        SELECT
            test_id,
            lcp_ms,
            tbt_ms,
            cls_score,
            performance_score,
            timestamp,
            created_at,
            run_number
        FROM candidate_runs
        WHERE run_date = (SELECT run_date FROM latest_day)
        ORDER BY run_number ASC NULLS LAST, created_at DESC
        LIMIT 3
        """,
        (url, page_type, device_type),
    )

    runs = cursor.fetchall()

    if not runs:
        conn.close()
        print(f"  ⚠️ No data found for {url} [{page_type}] [{device_type}]")
        return {**state, "should_end": True}

    test_ids = [r[0] for r in runs]

    lcp_values = [r[1] for r in runs if r[1] is not None]
    tbt_values = [r[2] for r in runs if r[2] is not None]
    cls_values = [r[3] for r in runs if r[3] is not None]
    perf_values = [r[4] for r in runs if r[4] is not None]

    avg_lcp = sum(lcp_values) / len(lcp_values) if lcp_values else 0
    avg_tbt = sum(tbt_values) / len(tbt_values) if tbt_values else 0
    avg_cls = sum(cls_values) / len(cls_values) if cls_values else 0
    avg_perf = sum(perf_values) / len(perf_values) if perf_values else 0

    # Confidence based on repeated LCP failure.
    # If LCP fails in all 3 runs, confidence is high.
    failed_lcp_runs = [v for v in lcp_values if v > 2500]

    if len(failed_lcp_runs) >= 3:
        confidence = "high"
    elif len(failed_lcp_runs) == 2:
        confidence = "medium"
    else:
        confidence = "low"

    metrics = {
        "avg_lcp_ms": round(avg_lcp, 2),
        "avg_tbt_ms": round(avg_tbt, 2),
        "avg_cls_score": round(avg_cls, 4),
        "avg_performance": round(avg_perf, 1),
        "test_ids": test_ids,
        "run_count": len(runs),
    }

    print(f"  ✅ Selected test_ids: {test_ids}")
    print(f"  ✅ LCP avg: {metrics['avg_lcp_ms']}ms")
    print(f"  ✅ TBT avg: {metrics['avg_tbt_ms']}ms")
    print(f"  ✅ CLS avg: {metrics['avg_cls_score']}")
    print(f"  ✅ Score avg: {metrics['avg_performance']}")
    print(f"  ✅ Confidence: {confidence}")

    # Aggregate opportunities only from the selected latest 3 runs.
    # Ranking:
    # 1. issue frequency across selected runs
    # 2. average savings
    # 3. severity
    cursor.execute(
        """
        SELECT
            MIN(lo.id) AS id,
            MIN(lo.opportunity_id) AS opportunity_id,
            lo.title,
            MAX(lo.description) AS description,
            AVG(lo.savings_ms)::int AS avg_savings,
            MAX(lo.severity) AS severity,
            MAX(lo.category) AS category,
            COUNT(*) AS frequency
        FROM lighthouse_opportunities lo
        WHERE lo.test_id = ANY(%s)
          AND COALESCE(lo.savings_ms, 0) > 0
        GROUP BY LOWER(TRIM(lo.title)), lo.title
        ORDER BY
            COUNT(*) DESC,
            AVG(lo.savings_ms) DESC
        LIMIT %s
        """,
        (test_ids, max_opportunities),
    )

    rows = cursor.fetchall()
    conn.close()

    opportunities = []

    for row in rows:
        avg_savings = int(row[4] or 0)
        severity = normalize_severity(row[5])
        category = row[6] or "performance"
        frequency = int(row[7] or 1)

        opportunities.append(
            {
                "id": row[0],
                "opportunity_id": row[1],
                "title": row[2],
                "description": row[3],
                "avg_savings_ms": avg_savings,
                "severity": severity,
                "category": category,
                "frequency": frequency,
                "affected_metric": infer_affected_metric(row[2], category),
            }
        )

    print(f"  ✅ Aggregated opportunities: {len(opportunities)}")

    for opp in opportunities:
        print(
            f"     - {opp['title']} | "
            f"{opp['avg_savings_ms']}ms | "
            f"freq {opp['frequency']}/{len(runs)} | "
            f"{opp['affected_metric']}"
        )

    return {
        **state,
        "metrics": metrics,
        "opportunities": opportunities,
        "confidence": confidence,
        "opp_index": 0,
        "should_end": len(opportunities) == 0,
    }
# ── N2 ───────────────────────────────────────────────────────────────────────

def sort_opportunities(state: AgentState) -> AgentState:
    print("\n[N2] Picking opportunity...")

    opportunities = state["opportunities"]
    opp_index = state["opp_index"]

    if opp_index >= len(opportunities):
        print("  ✅ All opportunities processed")
        return {**state, "should_end": True}

    current_opp = opportunities[opp_index]

    print(
        f"  ✅ [{opp_index + 1}/{len(opportunities)}] "
        f"{current_opp['title']} "
        f"({current_opp['avg_savings_ms']}ms, "
        f"{current_opp['affected_metric']})"
    )

    return {**state, "current_opp": current_opp}


# ── N3 ───────────────────────────────────────────────────────────────────────

def search_rag(state: AgentState) -> AgentState:
    print("\n[N3] Searching RAG...")

    opp = state["current_opp"]
    model = get_embed_model()

    conn = get_db_connection()
    cursor = conn.cursor()

    def search(query, top_k=3):
        vec = model.encode(query, normalize_embeddings=True).tolist()

        cursor.execute(
            """
            SELECT
                title,
                content,
                doc_type,
                1 - (embedding <=> %s::vector) AS similarity
            FROM rag_documents
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (str(vec), str(vec), top_k),
        )

        return cursor.fetchall()

    q1 = f"How to fix {opp['title']}"
    q2 = (
        f"{opp['title']} "
        f"{state['page_type']} page "
        f"{state['device_type']} "
        f"{opp['affected_metric']} "
        f"Korean e-commerce optimization"
    )

    results = search(q1) + search(q2)
    conn.close()

    seen = set()
    docs = []

    for row in results:
        title, content, doc_type, similarity = row
        if title not in seen:
            seen.add(title)
            docs.append(row)

    formatted = []
    for i, (title, content, doc_type, similarity) in enumerate(docs[:5], 1):
        formatted.append(f"[Doc {i}] {title}\n{content}")

    rag_context = "\n\n".join(formatted)

    print(f"  ✅ RAG docs: {len(docs[:5])}")

    return {**state, "rag_context": rag_context}


# ── N4 ───────────────────────────────────────────────────────────────────────

def assess_risk(state: AgentState) -> AgentState:
    print("\n[N4] Assessing risk...")

    opp = state["current_opp"]

    title = (opp.get("title") or "").lower()
    category = (opp.get("category") or "").lower()
    severity = normalize_severity(opp.get("severity"))

    risk_score = 0
    risk_details = {}

    if "server" in category or "server response" in title:
        risk_score += 4
        risk_details["category"] = "server config (+4)"
    elif "js" in category or "javascript" in category or "javascript" in title:
        risk_score += 2
        risk_details["category"] = "javascript change (+2)"
    elif "css" in category or "css" in title:
        risk_score += 1
        risk_details["category"] = "css change (+1)"
    elif "image" in category or "image" in title:
        risk_score += 1
        risk_details["category"] = "image change (+1)"
    else:
        risk_score += 1
        risk_details["category"] = f"{category or 'other'} (+1)"

    if severity == "high":
        risk_score += 2
        risk_details["severity"] = "high (+2)"
    elif severity == "medium":
        risk_score += 1
        risk_details["severity"] = "medium (+1)"

    risk_score = min(risk_score, 10)

    print(f"  ✅ Risk score: {risk_score}/10")
    print(f"  ✅ Risk details: {risk_details}")

    return {
        **state,
        "risk_score": risk_score,
        "risk_details": risk_details,
    }


# ── N5 ───────────────────────────────────────────────────────────────────────

def generate_fix(state: AgentState) -> AgentState:
    print("\n[N5] Generating fix...")

    opp = state["current_opp"]
    metrics = state["metrics"]
    rag_context = state["rag_context"]
    patch_template = build_patch_template(opp["title"], opp["category"])

    prompt = f"""
You are a web performance expert for Korean e-commerce.

Page URL: {state['url']}
Page type: {state['page_type']}
Device: {state['device_type']}

Current Performance:
- LCP: {metrics['avg_lcp_ms']}ms
- TBT: {metrics['avg_tbt_ms']}ms
- CLS: {metrics['avg_cls_score']}
- Performance Score: {metrics['avg_performance']}

Issue:
- Title: {opp['title']}
- Description: {opp.get('description', '')}
- Avg savings: {opp['avg_savings_ms']}ms
- Frequency: {opp.get('frequency', 1)}/{metrics['run_count']} runs
- Category: {opp['category']}
- Severity: {opp['severity']}
- Affected metric: {opp['affected_metric']}

RAG Context:
{rag_context}

Return ONLY valid JSON:
{{
  "action": "specific one-sentence fix action",
  "reasoning": "why this fix improves the metric",
  "patch_code": {{
    "summary": "short patch summary",
    "before": "before example or null",
    "after": "after example or null"
  }},
  "problem_summary": "short dashboard-friendly problem summary",
  "impact_if_not_fixed": "what happens if ignored",
  "impact_if_fixed": "expected improvement",
  "ux_improvement": "user experience benefit",
  "seo_impact": "SEO/Core Web Vitals benefit",
  "priority_level": "high/medium/low",
  "estimated_improvement": {opp['avg_savings_ms']},
  "affected_metric": "{opp['affected_metric']}",
  "target_file": "likely file/config area",
  "change_type": "server_config/javascript_optimization/css_optimization/image_optimization/network_optimization/performance_optimization"
}}
"""

    try:
        response = client.chat.completions.create(
            model=QWEN_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000,
            temperature=0.1,
        )

        raw = response.choices[0].message.content.strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        fix_rec = json.loads(raw)
        print(f"  ✅ Fix generated: {fix_rec.get('action', '')[:80]}")

    except Exception as e:
        print(f"  ⚠️ Qwen failed: {e}")
        print("  → Using dashboard-ready fallback fix plan")

        priority = priority_from_savings(opp["avg_savings_ms"], opp["severity"])

        fix_rec = {
            "action": f"Fix {opp['title']} to improve {opp['affected_metric']}",
            "reasoning": opp.get("description") or (
                f"This recommendation targets {opp['affected_metric']} "
                f"and is estimated to save about {opp['avg_savings_ms']}ms."
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
            "seo_impact": "Improves Lighthouse/Core Web Vitals signals that can support SEO quality.",
            "priority_level": priority,
            "estimated_improvement": opp["avg_savings_ms"],
            "affected_metric": opp["affected_metric"],
            "target_file": patch_template["target_file"],
            "change_type": patch_template["change_type"],
        }

    # Safety defaults if Qwen returns incomplete JSON
    fix_rec.setdefault("patch_code", patch_template)
    fix_rec.setdefault("problem_summary", opp["title"])
    fix_rec.setdefault("priority_level", priority_from_savings(opp["avg_savings_ms"], opp["severity"]))
    fix_rec.setdefault("estimated_improvement", opp["avg_savings_ms"])
    fix_rec.setdefault("affected_metric", opp["affected_metric"])
    fix_rec.setdefault("target_file", patch_template["target_file"])
    fix_rec.setdefault("change_type", patch_template["change_type"])

    return {**state, "fix_recommendation": fix_rec}


# ── N6 ───────────────────────────────────────────────────────────────────────

def save_fix_plan(state: AgentState) -> AgentState:
    print("\n[N6] Saving fix plan...")

    fix_rec = state["fix_recommendation"]
    opp = state["current_opp"]
    metrics = state["metrics"]

    # Phase 1: always wait for human review.
    # Actual patch application is Phase 2.
    patch_status = "pending_review"

    fix_plan_data = {
        "thread_id": str(uuid.uuid4()),
        "test_id": metrics["test_ids"][0],
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
        "old_score": metrics["avg_performance"],
        "total_risk_score": state["risk_score"],
        "risk_details": state["risk_details"],
        "confidence_level": state["confidence"],
        "patch_status": patch_status,
        "attempt_count": 0,
        "attempt_history": [],
        "affected_metric": fix_rec.get("affected_metric", opp.get("affected_metric")),
        "target_file": fix_rec.get("target_file"),
        "change_type": fix_rec.get("change_type", "modification"),
    }

    if state.get("dry_run"):
        print("  🔍 DRY RUN — not saving")
        print(json.dumps(fix_plan_data, indent=2, default=str))
        return {
            **state,
            "fix_plan_id": None,
            "opp_index": state["opp_index"] + 1,
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
        "opp_index": state["opp_index"] + 1,
    }


# ── Routing ──────────────────────────────────────────────────────────────────

def route_after_n1(state: AgentState) -> str:
    if state.get("should_end"):
        return "end"
    return "sort_opportunities"


def route_after_n2(state: AgentState) -> str:
    if state.get("should_end"):
        return "end"
    return "search_rag"


def route_after_n6(state: AgentState) -> str:
    if state["opp_index"] < len(state["opportunities"]):
        return "sort_opportunities"
    return "end"


def build_agent():
    graph = StateGraph(AgentState)

    graph.add_node("get_metrics", get_metrics)
    graph.add_node("sort_opportunities", sort_opportunities)
    graph.add_node("search_rag", search_rag)
    graph.add_node("assess_risk", assess_risk)
    graph.add_node("generate_fix", generate_fix)
    graph.add_node("save_fix_plan", save_fix_plan)

    graph.set_entry_point("get_metrics")

    graph.add_conditional_edges(
        "get_metrics",
        route_after_n1,
        {
            "sort_opportunities": "sort_opportunities",
            "end": END,
        },
    )

    graph.add_conditional_edges(
        "sort_opportunities",
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
            "sort_opportunities": "sort_opportunities",
            "end": END,
        },
    )

    return graph.compile()


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Luminara Remediation Agent — Phase 1"
    )

    parser.add_argument("--url", help="URL to analyze")
    parser.add_argument(
        "--page-type",
        default="main",
        choices=["main", "product", "cart", "category"],
    )
    parser.add_argument(
        "--device-type",
        default="desktop",
        choices=["mobile", "desktop"],
    )
    parser.add_argument(
        "--max-opportunities",
        type=int,
        default=MAX_OPPORTUNITIES,
        help="Max unique fix plans to generate. Default: 5",
    )
    parser.add_argument("--dry-run", action="store_true")

    args = parser.parse_args()

    if not args.url:
        print("Usage:")
        print(
            'python3 agent.py --url "https://www.decathlon.co.kr/" '
            "--page-type main --device-type desktop --max-opportunities 5 --dry-run"
        )
        return

    agent = build_agent()

    print("=" * 55)
    print("REMEDIATION AGENT — Phase 1")
    print("=" * 55)
    print(f"URL:    {args.url}")
    print(f"Page:   {args.page_type}")
    print(f"Device: {args.device_type}")
    print(f"Max:    {args.max_opportunities} unique opportunities")
    if args.dry_run:
        print("MODE:   DRY RUN")
    print("=" * 55)

    result = agent.invoke(
        {
            "url": args.url,
            "page_type": args.page_type,
            "device_type": args.device_type,
            "dry_run": args.dry_run,
            "max_opportunities": args.max_opportunities,
            "should_end": False,
            "opp_index": 0,
        }
    )

    print("=" * 55)
    print("✅ Done")
    print(f"Confidence: {result.get('confidence')}")
    print(f"Processed:  {result.get('opp_index', 0)} opportunities")
    print("=" * 55)


if __name__ == "__main__":
    main()