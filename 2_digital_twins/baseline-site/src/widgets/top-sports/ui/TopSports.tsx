export function TopSports() {
  const sports = [
    { label: "러닝", href: "/c/running" },
    { label: "등산", href: "/c/hiking" },
    { label: "필라테스/피트니스", href: "/c/fitness" },
    { label: "캠핑", href: "/c/camping" },
    { label: "킥보드/인라인", href: "/c/scooter" },
    { label: "수영/스노클링", href: "/c/swimming" },
    { label: "축구", href: "/c/football" },
    { label: "자전거", href: "/c/cycling" },
  ];

  return (
    <section style={{ backgroundColor: "white", padding: "24px 0", marginBottom: "8px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 16px" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 900, color: "#111827", marginBottom: "16px" }}>
          Top Sports
        </h2>
        <div style={{ borderTop: "1px solid #e5e7eb" }}>
          {sports.map((sport) => (
            <a
              key={sport.href}
              href={sport.href}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 0",
                borderBottom: "1px solid #e5e7eb",
                textDecoration: "none",
                color: "#111827",
                fontSize: "15px",
                fontWeight: 500,
              }}
            >
              <span>{sport.label}</span>
              <span style={{ color: "#9ca3af", fontSize: "18px" }}>{">"}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
