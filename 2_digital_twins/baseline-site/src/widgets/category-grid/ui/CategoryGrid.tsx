const categories = [
  { label: "러닝", emoji: "🏃", href: "/c/running" },
  { label: "등산", emoji: "🧗", href: "/c/hiking" },
  { label: "필라테스/피트니스", emoji: "🏋️", href: "/c/fitness" },
  { label: "캠핑", emoji: "⛺", href: "/c/camping" },
  { label: "킥보드/인라인", emoji: "🛴", href: "/c/scooter" },
  { label: "수영/스노클링", emoji: "🏊", href: "/c/swimming" },
];

export function CategoryGrid() {
  return (
    <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 900, marginBottom: "16px", color: "#111827" }}>
        스포츠 카테고리
      </h2>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {categories.map((cat) => (
          <a key={cat.href} href={cat.href} style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: "8px", textDecoration: "none", padding: "16px",
            backgroundColor: "white", borderRadius: "12px",
            border: "1px solid #e5e7eb", minWidth: "100px",
          }}>
            <span style={{ fontSize: "32px" }}>{cat.emoji}</span>
            <span style={{ fontSize: "12px", color: "#374151", textAlign: "center" }}>
              {cat.label}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}