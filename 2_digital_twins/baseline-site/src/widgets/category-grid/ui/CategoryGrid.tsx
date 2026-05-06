export function CategoryGrid() {
  const categories = [
    { label: "러닝", emoji: "🏃", href: "/c/running", color: "#fff7ed" },
    { label: "등산", emoji: "🧗", href: "/c/hiking", color: "#f0fdf4" },
    { label: "필라테스/피트니스", emoji: "🏋️", href: "/c/fitness", color: "#faf5ff" },
    { label: "캠핑", emoji: "⛺", href: "/c/camping", color: "#fefce8" },
    { label: "킥보드/인라인", emoji: "🛴", href: "/c/scooter", color: "#eff6ff" },
    { label: "수영/스노클링", emoji: "🏊", href: "/c/swimming", color: "#ecfeff" },
  ];

  return (
    <section style={{ backgroundColor: "white", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 900, color: "#111827", marginBottom: "16px" }}>
          스포츠 카테고리
        </h2>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {categories.map((cat) => (
            <a
              key={cat.href}
              href={cat.href}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                textDecoration: "none",
                padding: "16px 20px",
                backgroundColor: cat.color,
                borderRadius: "12px",
                minWidth: "100px",
                border: "1px solid #f3f4f6",
              }}
            >
              <span style={{ fontSize: "28px" }}>{cat.emoji}</span>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151", textAlign: "center", wordBreak: "keep-all" }}>
                {cat.label}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
