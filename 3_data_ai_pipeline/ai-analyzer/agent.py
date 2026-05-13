import os
import json
import uuid
import argparse
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv
from openai import OpenAI
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional
from sentence_transformers import SentenceTransformer

load_dotenv()

# vLLM / Qwen client
client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="dummy"
)

QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen32b-int4")


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


# N1
def get_metrics(state: AgentState) -> AgentState:
    print("\n[N1] Getting metrics...")

    url = state["url"]
    page_type = state["page_type"]
    device_type = state["device_type"]

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            test_id,
            lcp_ms,
            tbt_ms,
            cls_score,
            performance_score
        FROM lighthouse_runs
        WHERE url = %s
          AND page_type = %s
          AND device_type = %s
        ORDER BY created_at DESC
        LIMIT 3
    """, (url, page_type, device_type))

    runs = cursor.fetchall()

    if not runs:
        conn.close()
        print(f"  ⚠️ No data found for {url} [{page_type}] [{device_type}]")
        return {**state, "should_end": True}

    lcp_values = [r[1] for r in runs if r[1] is not None]
    tbt_values = [r[2] for r in runs if r[2] is not None]
    cls_values = [r[3] for r in runs if r[3] is not None]
    perf_values = [r[4] for r in runs if r[4] is not None]

    avg_lcp = sum(lcp_values) / len(lcp_values) if lcp_values else 0
    avg_tbt = sum(tbt_values) / len(tbt_values) if tbt_values else 0
    avg_cls = sum(cls_values) / len(cls_values) if cls_values else 0
    avg_perf = sum(perf_values) / len(perf_values) if perf_values else 0

    problem_runs = [r for r in runs if r[1] and r[1] > 2500]

    if len(problem_runs) == 3:
        confidence = "high"
    elif len(problem_runs) == 2:
        confidence = "medium"
    else:
        confidence = "low"

    metrics = {
        "avg_lcp_ms": round(avg_lcp, 2),
        "avg_tbt_ms": round(avg_tbt, 2),
        "avg_cls_score": round(avg_cls, 4),
        "avg_performance": round(avg_perf, 1),
        "test_ids": [r[0] for r in runs],
        "run_count": len(runs),
    }

    print(f"  ✅ LCP: {metrics['avg_lcp_ms']}ms")
    print(f"  ✅ TBT: {metrics['avg_tbt_ms']}ms")
    print(f"  ✅ CLS: {metrics['avg_cls_score']}")
    print(f"  ✅ Score: {metrics['avg_performance']}")
    print(f"  ✅ Confidence: {confidence}")

    cursor.execute("""
        SELECT
            lo.id,
            lo.opportunity_id,
            lo.title,
            lo.description,
            AVG(lo.savings_ms)::int AS avg_savings,
            lo.severity,
            lo.category
        FROM lighthouse_opportunities lo
        JOIN lighthouse_runs lr
          ON lo.test_id = lr.test_id
        WHERE lr.url = %s
          AND lr.page_type = %s
          AND lr.device_type = %s
        GROUP BY
            lo.id,
            lo.opportunity_id,
            lo.title,
            lo.description,
            lo.severity,
            lo.category
        ORDER BY avg_savings DESC
    """, (url, page_type, device_type))

    rows = cursor.fetchall()
    conn.close()

    opportunities = []
    for row in rows:
        opportunities.append({
            "id": row[0],
            "opportunity_id": row[1],
            "title": row[2],
            "description": row[3],
            "avg_savings_ms": row[4],
            "severity": row[5],
            "category": row[6],
        })

    print(f"  ✅ Opportunities: {len(opportunities)}")

    return {
        **state,
        "metrics": metrics,
        "opportunities": opportunities,
        "confidence": confidence,
        "opp_index": 0,
        "should_end": confidence == "low" or len(opportunities) == 0,
    }


# N2
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
        f"({current_opp['avg_savings_ms']}ms)"
    )

    return {**state, "current_opp": current_opp}


# N3
def search_rag(state: AgentState) -> AgentState:
    print("\n[N3] Searching RAG...")

    opp = state["current_opp"]
    model = get_embed_model()

    conn = get_db_connection()
    cursor = conn.cursor()

    def search(query, top_k=3):
        vec = model.encode(query, normalize_embeddings=True).tolist()

        cursor.execute("""
            SELECT
                title,
                content,
                doc_type,
                1 - (embedding <=> %s::vector) AS similarity
            FROM rag_documents
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """, (str(vec), str(vec), top_k))

        return cursor.fetchall()

    q1 = f"How to fix {opp['title']}"
    q2 = (
        f"{opp['title']} "
        f"{state['page_type']} page "
        f"{state['device_type']} "
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


# N4
def assess_risk(state: AgentState) -> AgentState:
    print("\n[N4] Assessing risk...")

    opp = state["current_opp"]

    category = (opp.get("category") or "").lower()
    severity = (opp.get("severity") or "").lower()

    risk_score = 0
    risk_details = {}

    if "server" in category:
        risk_score += 4
        risk_details["category"] = "server config (+4)"
    elif "js" in category or "javascript" in category:
        risk_score += 2
        risk_details["category"] = "javascript change (+2)"
    elif "css" in category:
        risk_score += 1
        risk_details["category"] = "css change (+1)"
    elif "image" in category:
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

    return {
        **state,
        "risk_score": risk_score,
        "risk_details": risk_details,
    }


# N5
def generate_fix(state: AgentState) -> AgentState:
    print("\n[N5] Generating fix...")

    opp = state["current_opp"]
    metrics = state["metrics"]
    rag_context = state["rag_context"]

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
- Category: {opp['category']}
- Severity: {opp['severity']}

RAG Context:
{rag_context}

Respond ONLY with valid JSON:
{{
  "action": "one sentence exact fix action",
  "reasoning": "why this fixes the problem",
  "patch_code": null,
  "problem_summary": "brief problem description",
  "impact_if_not_fixed": "consequence if not fixed",
  "impact_if_fixed": "expected improvement",
  "ux_improvement": "user experience benefit",
  "seo_impact": "SEO benefit",
  "priority_level": "high/medium/low",
  "estimated_improvement": {opp['avg_savings_ms']},
  "target_file": null,
  "change_type": "modification"
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
        print("  → Using fallback fix plan")

        fix_rec = {
            "action": f"Fix: {opp['title']}",
            "reasoning": opp.get("description", ""),
            "patch_code": None,
            "problem_summary": opp["title"],
            "impact_if_not_fixed": "Performance remains poor.",
            "impact_if_fixed": f"Expected to save about {opp['avg_savings_ms']}ms.",
            "ux_improvement": "Faster page loading and better responsiveness.",
            "seo_impact": "Better Core Web Vitals and Lighthouse score.",
            "priority_level": opp.get("severity") or "medium",
            "estimated_improvement": opp["avg_savings_ms"],
            "target_file": None,
            "change_type": "modification",
        }

    return {**state, "fix_recommendation": fix_rec}


# N6
def save_fix_plan(state: AgentState) -> AgentState:
    print("\n[N6] Saving fix plan...")

    fix_rec = state["fix_recommendation"]
    opp = state["current_opp"]
    metrics = state["metrics"]

    patch_status = "pending" if state["risk_score"] >= 7 else "approved"

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
        cursor.execute("""
            INSERT INTO fix_plans (
                thread_id,
                test_id,
                opportunity_id,
                action,
                reasoning,
                patch_code,
                problem_summary,
                impact_if_not_fixed,
                impact_if_fixed,
                ux_improvement,
                seo_impact,
                priority_level,
                estimated_improvement,
                old_score,
                total_risk_score,
                risk_details,
                confidence_level,
                patch_status,
                attempt_count,
                attempt_history
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            RETURNING id
        """, (
            fix_plan_data["thread_id"],
            fix_plan_data["test_id"],
            fix_plan_data["opportunity_id"],
            fix_plan_data["action"],
            fix_plan_data["reasoning"],
            fix_plan_data["patch_code"],
            fix_plan_data["problem_summary"],
            fix_plan_data["impact_if_not_fixed"],
            fix_plan_data["impact_if_fixed"],
            fix_plan_data["ux_improvement"],
            fix_plan_data["seo_impact"],
            fix_plan_data["priority_level"],
            fix_plan_data["estimated_improvement"],
            fix_plan_data["old_score"],
            fix_plan_data["total_risk_score"],
            Json(fix_plan_data["risk_details"]),
            fix_plan_data["confidence_level"],
            fix_plan_data["patch_status"],
            fix_plan_data["attempt_count"],
            Json(fix_plan_data["attempt_history"]),
        ))

        fix_plan_id = cursor.fetchone()[0]
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
    parser.add_argument("--dry-run", action="store_true")

    args = parser.parse_args()

    if not args.url:
        print("Usage:")
        print(
            'python3 agent.py --url "https://www.decathlon.co.kr/" '
            "--page-type main --device-type desktop --dry-run"
        )
        return

    agent = build_agent()

    print("=" * 55)
    print("REMEDIATION AGENT — Phase 1")
    print("=" * 55)
    print(f"URL:    {args.url}")
    print(f"Page:   {args.page_type}")
    print(f"Device: {args.device_type}")
    if args.dry_run:
        print("MODE:   DRY RUN")
    print("=" * 55)

    result = agent.invoke({
        "url": args.url,
        "page_type": args.page_type,
        "device_type": args.device_type,
        "dry_run": args.dry_run,
        "should_end": False,
        "opp_index": 0,
    })

    print("=" * 55)
    print("✅ Done")
    print(f"Confidence: {result.get('confidence')}")
    print(f"Processed:  {result.get('opp_index', 0)} opportunities")
    print("=" * 55)


if __name__ == "__main__":
    main()