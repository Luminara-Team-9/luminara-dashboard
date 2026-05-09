export function AnnouncementBar() {
  const items = [
    { icon: "🔄", text: "멤버십 프로그램", subText: "자세히 보기", href: "/s/korea_membership" },
    { icon: "📍", text: "매장 안내", subText: "위치 보기", href: "/s/our-stores" },
    { icon: "🚚", text: "5만원 이상 무료배송", subText: "자세히 보기", href: "/s/return-and-exchange-1" },
    { icon: "ℹ️", text: "데카트론 브랜드 이야기", subText: "자세히 보기", href: "/s/about-decathlon-korea" },
  ];

  return (
    <div style={{ backgroundColor: "#f3f4f6", borderBottom: "1px solid #e5e7eb" }}>
      <div style={{
        maxWidth: "1200px", margin: "0 auto",
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
      }}>
        {items.map((item, i) => (
          <a
            key={i}
            href={item.href}
            style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "16px", textDecoration: "none",
              borderRight: i < 3 ? "1px solid #e5e7eb" : "none",
            }}
          >
            <span style={{ fontSize: "24px" }}>{item.icon}</span>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>{item.text}</div>
              <div style={{ fontSize: "12px", color: "#0082C3" }}>{item.subText} {">"}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
