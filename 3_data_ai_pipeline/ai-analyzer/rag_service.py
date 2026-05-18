from datetime import datetime

from fastapi import FastAPI
from embed import (
    get_db_connection,
    load_model,
    embed_cwv_guides,
    embed_opportunities,
    embed_competitor_benchmarks,
)

app = FastAPI()

print("🚀 Loading BGE-M3 once for RAG service...")
model = load_model()
print("✅ RAG service ready")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "rag_service",
        "time": datetime.now().isoformat(),
    }


@app.post("/update")
def update_rag():
    conn = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        total = 0

        total += embed_cwv_guides(cursor, model)
        conn.commit()

        total += embed_opportunities(cursor, model)
        conn.commit()

        total += embed_competitor_benchmarks(cursor, model)
        conn.commit()

        cursor.execute("SELECT COUNT(*) FROM rag_documents")
        count = cursor.fetchone()[0]

        return {
            "status": "success",
            "updated_documents": total,
            "total_documents": count,
        }

    except Exception as e:
        if conn:
            conn.rollback()

        return {
            "status": "failed",
            "error": str(e),
        }

    finally:
        if conn:
            conn.close()