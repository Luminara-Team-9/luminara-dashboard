"""
agent.py
LangGraph Remediation Agent — Phase 1 MVP.

Analyzes Decathlon page performance metrics,
searches RAG knowledge base, generates specific
fix recommendations using Qwen via vLLM.

Nodes:
    N1 - get_metrics        → fetch today's metrics + confidence
    N2 - sort_opportunities → highest impact first
    N3 - search_rag         → find relevant docs
    N4 - assess_risk        → calculate risk score
    N5 - generate_fix       → Qwen generates fix
    N6 - save_fix_plan      → save to DB (duplicate safe)

Usage:
    python3 agent.py --url https://www.decathlon.co.kr
                     --page-type main --device-type desktop
    python3 agent.py --auto
    python3 agent.py --auto --dry-run
"""

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


# ── vLLM Client ───────────────────────────────────────────────────────────────

client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="dummy"
)
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen32b-int4")


# ── DB Connection ─────────────────────────────────────────────────────────────

# def get_db_connection():
#     """Connect to core_db."""
#     return psycopg2.connect(
#         host=os.getenv('HOST_IP'),
#         port=os.getenv('PGPORT', '5432'),
#         dbname=os.getenv('POSTGRES_DB'),
#         user=os.getenv('POSTGRES_USER'),
#         password=os.getenv('POSTGRES_PASSWORD')
#     )

def get_db_connection():
    return psycopg2.connect(
        # Matches your manual '-h /tmp'
        host="/abr/coss41/Luminara_App/data/sockets/postgres", 
        port=5432,
        user="lumin_admin",    # From your Step 5
        password="lumin_postgres", # From your Step 5
        database="core_db"     # From your Step 5 (\c core_db)
    )


# ── Embedding Model (Singleton) ───────────────────────────────────────────────

_embed_model = None

def get_embed_model():
    """Load BGE-M3 once and reuse."""
    global _embed_model
    if _embed_model is None:
        print("Loading BGE-M3...")
        _embed_model = SentenceTransformer('BAAI/bge-m3')
        print("✅ BGE-M3 loaded")
    return _embed_model


# ── Agent State ───────────────────────────────────────────────────────────────

class AgentState(TypedDict):
    # Input
    url: str
    page_type: str        # main/product/cart/category
    device_type: str      # mobile/desktop
    dry_run: bool

    # N1 output
    metrics: dict
    opportunities: list
    confidence: str

    # N2 output
    current_opp: dict
    opp_index: int

    # N3 output
    rag_context: str

    # N4 output
    risk_score: int
    risk_details: dict

    # N5 output
    fix_recommendation: dict

    # N6 output
    fix_plan_id: Optional[int]

    # Control
    attempt_count: int
    should_end: bool


# ── N1: get_metrics ───────────────────────────────────────────────────────────

def get_metrics(state: AgentState) -> AgentState:
    """
    N1: Fetch TODAY's metrics from DB.
    Filter by url + page_type + device_type.
    Calculate confidence from today's 3 runs.
    Skip if confidence is low.
    """
    print("\n[N1] Getting metrics...")

    url         = state["url"]
    page_type   = state["page_type"]
    device_type = state["device_type"]

    conn   = get_db_connection()
    cursor = conn.cursor()

    # today's 3 runs for this url + page + device
    cursor.execute("""
        SELECT
            test_id,
            lcp_ms,
            tbt_ms,
            cls_score,
            performance_score,
            page_type,
            device_type
        FROM lighthouse_runs
        WHERE url         = %s
          AND page_type   = %s
          AND device_type = %s
          AND DATE(created_at) = CURRENT_DATE
        ORDER BY created_at DESC
        LIMIT 3
    """, (url, page_type, device_type))
    runs = cursor.fetchall()

    if not runs:
        print(f"  ⚠️  No data today for "
              f"{url} [{page_type}] [{device_type}]")
        conn.close()
        return {**state, "should_end": True}

    # calculate averages
    lcp_values  = [r[1] for r in runs if r[1]]
    tbt_values  = [r[2] for r in runs if r[2]]
    cls_values  = [r[3] for r in runs if r[3]]
    perf_values = [r[4] for r in runs if r[4]]

    avg_lcp  = sum(lcp_values)  / len(lcp_values)  if lcp_values  else 0
    avg_tbt  = sum(tbt_values)  / len(tbt_values)  if tbt_values  else 0
    avg_cls  = sum(cls_values)  / len(cls_values)  if cls_values  else 0
    avg_perf = sum(perf_values) / len(perf_values) if perf_values else 0

    # confidence — how many runs have LCP problem?
    problem_runs = [r for r in runs if r[1] and r[1] > 2500]
    if len(problem_runs) == 3:
        confidence = "high"
    elif len(problem_runs) == 2:
        confidence = "medium"
    else:
        confidence = "low"

    metrics = {
        "avg_lcp_ms":      round(avg_lcp, 2),
        "avg_tbt_ms":      round(avg_tbt, 2),
        "avg_cls_score":   round(avg_cls, 4),
        "avg_performance": round(avg_perf, 1),
        "page_type":       page_type,
        "device_type":     device_type,
        "test_ids":        [r[0] for r in runs],
        "run_count":       len(runs),
    }

    print(f"  ✅ Page:       {page_type} [{device_type}]")
    print(f"  ✅ LCP:        {metrics['avg_lcp_ms']}ms")
    print(f"  ✅ TBT:        {metrics['avg_tbt_ms']}ms")
    print(f"  ✅ Score:      {metrics['avg_performance']}")
    print(f"  ✅ Runs today: {metrics['run_count']}")
    print(f"  ✅ Confidence: {confidence}")

    # today's opportunities for this page + device
    cursor.execute("""
        SELECT
            lo.id,
            lo.opportunity_id,
            lo.title,
            lo.description,
            AVG(lo.savings_ms)::int as avg_savings,
            lo.severity,
            lo.category
        FROM lighthouse_opportunities lo
        JOIN lighthouse_runs lr
          ON lo.test_id = lr.test_id
        WHERE lr.url         = %s
          AND lr.page_type   = %s
          AND lr.device_type = %s
          AND DATE(lr.created_at) = CURRENT_DATE
        GROUP BY
            lo.id,
            lo.opportunity_id,
            lo.title,
            lo.description,
            lo.severity,
            lo.category
        ORDER BY avg_savings DESC
    """, (url, page_type, device_type))
    opp_rows = cursor.fetchall()
    conn.close()

    opportunities = []
    for row in opp_rows:
        opportunities.append({
            "id":             row[0],
            "opportunity_id": row[1],
            "title":          row[2],
            "description":    row[3],
            "avg_savings_ms": row[4],
            "severity":       row[5],
            "category":       row[6],
        })

    print(f"  ✅ Opportunities today: {len(opportunities)}")

    return {
        **state,
        "metrics":       metrics,
        "opportunities": opportunities,
        "confidence":    confidence,
        "opp_index":     0,
        "should_end":    confidence == "low",
    }


# ── N2: sort_opportunities ────────────────────────────────────────────────────

def sort_opportunities(state: AgentState) -> AgentState:
    """
    N2: Pick highest impact opportunity.
    Already sorted by avg_savings DESC from N1.
    Loop through all opportunities one by one.
    """
    print("\n[N2] Picking next opportunity...")

    opportunities = state["opportunities"]
    opp_index     = state["opp_index"]

    if opp_index >= len(opportunities):
        print("  ✅ All opportunities processed for today")
        return {**state, "should_end": True}

    current_opp = opportunities[opp_index]
    print(f"  ✅ [{opp_index + 1}/{len(opportunities)}] "
          f"{current_opp['title']} "
          f"(avg savings: {current_opp['avg_savings_ms']}ms)")

    return {**state, "current_opp": current_opp}


# ── N3: search_rag ────────────────────────────────────────────────────────────

def search_rag(state: AgentState) -> AgentState:
    """
    N3: Search RAG for relevant docs.
    Query 1: general fix knowledge
    Query 2: page + device + Korean specific
    """
    print("\n[N3] Searching RAG...")

    opp   = state["current_opp"]
    model = get_embed_model()

    conn   = get_db_connection()
    cursor = conn.cursor()

    def search(query, top_k=3):
        vec = model.encode(
            query,
            normalize_embeddings=True
        ).tolist()
        cursor.execute("""
            SELECT
                title, content, doc_type,
                1 - (embedding <=> %s::vector) AS similarity
            FROM rag_documents
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """, (str(vec), str(vec), top_k))
        return cursor.fetchall()

    # Query 1: general fix knowledge
    q1 = f"How to fix {opp['title']}"
    results1 = search(q1)
    print(f"  ✅ Query 1: '{q1}'")

    # Query 2: page + device + Korean specific
    q2 = (f"{opp['title']} "
          f"{state['page_type']} page "
          f"{state['device_type']} "
          f"Korean e-commerce fix")
    results2 = search(q2)
    print(f"  ✅ Query 2: '{q2}'")

    conn.close()

    # combine + deduplicate by title
    seen     = set()
    combined = []
    for row in results1 + results2:
        if row[0] not in seen:
            seen.add(row[0])
            combined.append(row)

    # format for Qwen prompt
    formatted = []
    for i, (title, content, doc_type, sim) in \
            enumerate(combined[:5], 1):
        formatted.append(f"[Doc {i}] {title}\n{content}")

    rag_context = "\n\n".join(formatted)
    print(f"  ✅ Context docs: {len(combined[:5])}")

    return {**state, "rag_context": rag_context}


# ── N4: assess_risk ───────────────────────────────────────────────────────────

def assess_risk(state: AgentState) -> AgentState:
    """
    N4: Calculate risk score 0-10.
    >= 7 needs human approval (status=pending).
    < 7 auto approve.
    """
    print("\n[N4] Assessing risk...")

    opp      = state["current_opp"]
    category = opp.get("category", "").lower()
    severity = opp.get("severity", "").lower()

    risk_score = 0
    details    = {}

    # category risk
    if "server" in category:
        risk_score += 4
        details["category"] = "server config (+4)"
    elif "javascript" in category or "js" in category:
        risk_score += 2
        details["category"] = "JS change (+2)"
    elif "css" in category:
        risk_score += 1
        details["category"] = "CSS change (+1)"
    elif "image" in category:
        risk_score += 1
        details["category"] = "image change (+1)"
    else:
        risk_score += 1
        details["category"] = f"{category} (+1)"

    # severity risk
    if severity == "high":
        risk_score += 2
        details["severity"] = "high severity (+2)"
    elif severity == "medium":
        risk_score += 1
        details["severity"] = "medium severity (+1)"

    # cap at 10
    risk_score = min(risk_score, 10)

    status = "⚠️  needs human approval" \
             if risk_score >= 7 else "✅ auto approve"
    print(f"  ✅ Risk: {risk_score}/10 — {status}")
    print(f"  ✅ Details: {details}")

    return {
        **state,
        "risk_score":   risk_score,
        "risk_details": details,
    }


# ── N5: generate_fix ──────────────────────────────────────────────────────────

def generate_fix(state: AgentState) -> AgentState:
    """
    N5: Call Qwen via vLLM to generate fix.
    Falls back to basic plan if Qwen fails.
    """
    print("\n[N5] Generating fix with Qwen...")

    opp         = state["current_opp"]
    metrics     = state["metrics"]
    rag_context = state["rag_context"]

    prompt = f"""You are a web performance expert for Korean e-commerce.

Page URL:   {state['url']}
Page type:  {state['page_type']}
Device:     {state['device_type']}

Current Performance (averaged from {metrics['run_count']} runs today):
- LCP:   {metrics['avg_lcp_ms']}ms (target: under 2500ms)
- TBT:   {metrics['avg_tbt_ms']}ms (target: under 200ms)
- CLS:   {metrics['avg_cls_score']} (target: under 0.1)
- Score: {metrics['avg_performance']}/100

Issue to fix:
- Title:       {opp['title']}
- Description: {opp.get('description', '')}
- Avg savings: {opp['avg_savings_ms']}ms
- Category:    {opp['category']}
- Severity:    {opp['severity']}

Knowledge Base Context:
{rag_context}

Respond ONLY with valid JSON, no text outside JSON:
{{
    "action": "one sentence exact fix action",
    "reasoning": "why this fixes the problem",
    "patch_code": "actual code or config change or null",
    "problem_summary": "brief problem description",
    "impact_if_not_fixed": "consequence of not fixing",
    "impact_if_fixed": "expected improvement after fix",
    "ux_improvement": "user experience benefit",
    "seo_impact": "SEO benefit",
    "priority_level": "high/medium/low",
    "estimated_improvement": {opp['avg_savings_ms']},
    "target_file": "file path or null",
    "change_type": "addition/modification/deletion/config"
}}"""

    try:
        response = client.chat.completions.create(
            model=QWEN_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000,
            temperature=0.1,
        )
        raw = response.choices[0].message.content.strip()

        # strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        fix_rec = json.loads(raw)
        print(f"  ✅ Fix: {fix_rec.get('action', '')[:80]}")

    except Exception as e:
        print(f"  ⚠️  Qwen error: {e} — using fallback")
        fix_rec = {
            "action":                f"Fix: {opp['title']}",
            "reasoning":             opp.get("description", ""),
            "patch_code":            None,
            "problem_summary":       opp["title"],
            "impact_if_not_fixed":   "Performance remains poor",
            "impact_if_fixed":       f"Save ~{opp['avg_savings_ms']}ms",
            "ux_improvement":        "Faster page load",
            "seo_impact":            "Better Core Web Vitals",
            "priority_level":        opp.get("severity") or "medium",
            "estimated_improvement": opp["avg_savings_ms"],
            "target_file":           None,
            "change_type":           "modification",
        }

    return {**state, "fix_recommendation": fix_rec}


# ── N6: save_fix_plan ─────────────────────────────────────────────────────────

def save_fix_plan(state: AgentState) -> AgentState:
    """
    N6: Save fix plan to DB.
    Skips if same opportunity already saved today.
    dry_run → print only, no DB write.
    """
    print("\n[N6] Saving fix plan...")

    fix_rec = state["fix_recommendation"]
    opp     = state["current_opp"]
    metrics = state["metrics"]
    dry_run = state.get("dry_run", False)

    patch_status = "pending" \
                   if state["risk_score"] >= 7 \
                   else "approved"

    thread_id = str(uuid.uuid4())

    fix_plan_data = {
        "thread_id":             thread_id,
        "test_id":               metrics["test_ids"][0],
        "opportunity_id":        opp["id"],
        "action":                fix_rec.get("action", ""),
        "reasoning":             fix_rec.get("reasoning", ""),
        "patch_code":            fix_rec.get("patch_code"),
        "problem_summary":       fix_rec.get("problem_summary"),
        "impact_if_not_fixed":   fix_rec.get("impact_if_not_fixed"),
        "impact_if_fixed":       fix_rec.get("impact_if_fixed"),
        "ux_improvement":        fix_rec.get("ux_improvement"),
        "seo_impact":            fix_rec.get("seo_impact"),
        "priority_level":        fix_rec.get("priority_level", "medium"),
        "estimated_improvement": fix_rec.get("estimated_improvement", 0),
        "old_score":             metrics["avg_performance"],
        "total_risk_score":      state["risk_score"],
        "risk_details":          state["risk_details"],
        "confidence_level":      state["confidence"],
        "patch_status":          patch_status,
        "attempt_count":         0,
        "attempt_history":       [],
    }

    # ── dry run mode ──────────────────────────────
    if dry_run:
        print("\n  🔍 DRY RUN — not saving to DB")
        print(json.dumps(fix_plan_data, indent=2, default=str))
        return {
            **state,
            "fix_plan_id": None,
            "opp_index":   state["opp_index"] + 1,
        }

    conn   = get_db_connection()
    cursor = conn.cursor()

    try:
        # duplicate check — same opportunity today?
        cursor.execute("""
            SELECT fp.id
            FROM fix_plans fp
            JOIN lighthouse_runs lr
              ON fp.test_id = lr.test_id
            WHERE fp.opportunity_id  = %s
              AND lr.page_type       = %s
              AND lr.device_type     = %s
              AND DATE(fp.created_at) = CURRENT_DATE
            LIMIT 1
        """, (
            opp["id"],
            state["page_type"],
            state["device_type"],
        ))

        if cursor.fetchone():
            print(f"  ⏭️  Already saved today — skip")
            conn.close()
            return {
                **state,
                "fix_plan_id": None,
                "opp_index":   state["opp_index"] + 1,
            }

        # insert fix_plan
        cursor.execute("""
            INSERT INTO fix_plans (
                thread_id, test_id, opportunity_id,
                action, reasoning, patch_code,
                problem_summary, impact_if_not_fixed,
                impact_if_fixed, ux_improvement,
                seo_impact, priority_level,
                estimated_improvement, old_score,
                total_risk_score, risk_details,
                confidence_level, patch_status,
                attempt_count, attempt_history
            ) VALUES (
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s,
                %s, %s
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
        print(f"  ✅ Saved: id={fix_plan_id} "
              f"status={patch_status}")

        # save fix_plan_changes if code provided
        if fix_rec.get("target_file") or \
           fix_rec.get("patch_code"):
            cursor.execute("""
                INSERT INTO fix_plan_changes (
                    fix_plan_id, target_file,
                    suggested_code, change_type,
                    change_reason
                ) VALUES (%s, %s, %s, %s, %s)
            """, (
                fix_plan_id,
                fix_rec.get("target_file", "unknown"),
                fix_rec.get("patch_code"),
                fix_rec.get("change_type", "modification"),
                fix_rec.get("reasoning", ""),
            ))
            conn.commit()
            print(f"  ✅ fix_plan_changes saved")

    except Exception as e:
        conn.rollback()
        print(f"  ❌ Save failed: {e}")
        fix_plan_id = None

    finally:
        conn.close()

    return {
        **state,
        "fix_plan_id": fix_plan_id,
        "opp_index":   state["opp_index"] + 1,
    }


# ── Routing Functions ─────────────────────────────────────────────────────────

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


# ── Build Graph ───────────────────────────────────────────────────────────────

def build_agent():
    graph = StateGraph(AgentState)

    graph.add_node("get_metrics",        get_metrics)
    graph.add_node("sort_opportunities", sort_opportunities)
    graph.add_node("search_rag",         search_rag)
    graph.add_node("assess_risk",        assess_risk)
    graph.add_node("generate_fix",       generate_fix)
    graph.add_node("save_fix_plan",      save_fix_plan)

    graph.set_entry_point("get_metrics")

    graph.add_conditional_edges(
        "get_metrics",
        route_after_n1,
        {"end": END,
         "sort_opportunities": "sort_opportunities"}
    )
    graph.add_conditional_edges(
        "sort_opportunities",
        route_after_n2,
        {"end": END,
         "search_rag": "search_rag"}
    )
    graph.add_edge("search_rag",   "assess_risk")
    graph.add_edge("assess_risk",  "generate_fix")
    graph.add_edge("generate_fix", "save_fix_plan")
    graph.add_conditional_edges(
        "save_fix_plan",
        route_after_n6,
        {"sort_opportunities": "sort_opportunities",
         "end": END}
    )

    return graph.compile()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Luminara Remediation Agent — Phase 1"
    )
    parser.add_argument(
        "--url",
        help="Single URL to analyze"
    )
    parser.add_argument(
        "--page-type",
        default="main",
        choices=["main", "product", "cart", "category"],
        help="Page type (default: main)"
    )
    parser.add_argument(
        "--device-type",
        default="desktop",
        choices=["mobile", "desktop"],
        help="Device type (default: desktop)"
    )
    parser.add_argument(
        "--auto",
        action="store_true",
        help="Process all page+device combinations today"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Test mode — no DB writes"
    )
    args = parser.parse_args()

    agent = build_agent()

    # ── Single URL mode ───────────────────────────
    if args.url:
        print(f"\n{'='*55}")
        print(f"REMEDIATION AGENT — Phase 1")
        print(f"{'='*55}")
        print(f"URL:    {args.url}")
        print(f"Page:   {args.page_type}")
        print(f"Device: {args.device_type}")
        if args.dry_run:
            print(f"MODE:   DRY RUN")
        print(f"{'='*55}")

        result = agent.invoke({
            "url":           args.url,
            "page_type":     args.page_type,
            "device_type":   args.device_type,
            "dry_run":       args.dry_run,
            "attempt_count": 0,
            "should_end":    False,
            "opp_index":     0,
        })

        print(f"\n{'='*55}")
        print(f"✅ Done!")
        print(f"   Confidence: {result.get('confidence')}")
        print(f"   Processed:  "
              f"{result.get('opp_index', 0)} opportunities")
        print(f"{'='*55}")

    # ── Auto mode ─────────────────────────────────
    elif args.auto:
        conn   = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT DISTINCT
                url,
                page_type,
                device_type
            FROM lighthouse_runs
            WHERE site_type = 'decathlon'
              AND DATE(created_at) = CURRENT_DATE
            ORDER BY url, page_type, device_type
        """)
        pages = cursor.fetchall()
        conn.close()

        if not pages:
            print("⚠️  No data found for today")
            print("   Run Phoo's scanner first")
            return

        print(f"\n{'='*55}")
        print(f"REMEDIATION AGENT — AUTO MODE")
        if args.dry_run:
            print(f"MODE: DRY RUN")
        print(f"Found {len(pages)} combinations today")
        print(f"{'='*55}")

        for i, (url, page_type, device_type) in \
                enumerate(pages, 1):
            print(f"\n[{i}/{len(pages)}] "
                  f"{url} [{page_type}] [{device_type}]")

            agent.invoke({
                "url":           url,
                "page_type":     page_type,
                "device_type":   device_type,
                "dry_run":       args.dry_run,
                "attempt_count": 0,
                "should_end":    False,
                "opp_index":     0,
            })

        print(f"\n{'='*55}")
        print(f"✅ All pages processed!")
        print(f"{'='*55}")

    else:
        print("Usage:")
        print("  Single:")
        print("    python3 agent.py --url URL "
              "--page-type main --device-type desktop")
        print("  All pages:")
        print("    python3 agent.py --auto")
        print("  Test:")
        print("    python3 agent.py --auto --dry-run")


if __name__ == "__main__":
    main()