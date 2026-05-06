const announcementItems = [
  { icon: "🔄", text: "멤버십 프로그램", subText: "자세히 보기", href: "/s/korea_membership" },
  { icon: "📍", text: "매장 안내", subText: "위치 보기", href: "/s/our-stores" },
  { icon: "🚚", text: "5만원 이상 무료배송", subText: "자세히 보기", href: "/s/return-and-exchange-1" },
  { icon: "ℹ️", text: "데카트론 브랜드 이야기", subText: "자세히 보기", href: "/s/about-decathlon-korea" },
];

const navCategories = [
  { label: "모든 스포츠", href: "/c/all-sports" },
  { label: "러닝", href: "/c/running" },
  { label: "등산", href: "/c/hiking" },
  { label: "남성", href: "/c/men" },
  { label: "여성", href: "/c/women" },
  { label: "신제품", href: "/c/ss-new.html", color: "#0082C3" },
  { label: "클리어런스", href: "/c/clearance", color: "#ef4444" },
];

export function Header() {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, backgroundColor: "white" }}>
      {/* Main Header */}
      <div style={{ borderBottom: "1px solid #e5e7eb" }}>
        <div style={{
          maxWidth: "1200px", margin: "0 auto", padding: "0 16px",
          height: "64px", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: "16px",
        }}>
          {/* Logo */}
          <a href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
            <div style={{
              backgroundColor: "#0082C3", color: "white",
              fontWeight: 900, fontSize: "18px",
              padding: "6px 12px", borderRadius: "4px",
              letterSpacing: "-0.5px",
            }}>
              DECATHLON
            </div>
          </a>

          {/* Search - centered and wide */}
          <div style={{ flex: 1, maxWidth: "640px" }}>
            <div style={{
              display: "flex", alignItems: "center",
              border: "2px solid #e5e7eb", borderRadius: "999px",
              overflow: "hidden", backgroundColor: "white",
            }}>
              <span style={{ padding: "0 12px", color: "#9ca3af", fontSize: "18px" }}>🔍</span>
              <input
                type="text"
                placeholder="공식 리뷰 작성 시 500 포인트 증정!"
                style={{
                  flex: 1, padding: "10px 0", fontSize: "14px",
                  outline: "none", border: "none", backgroundColor: "transparent",
                }}
              />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
            <a href="/login" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", textDecoration: "none", color: "#374151" }}>
              <span style={{ fontSize: "20px" }}>👤</span>
              <span style={{ fontSize: "10px" }}>로그인</span>
            </a>
            <a href="/s/our-stores" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", textDecoration: "none", color: "#374151" }}>
              <span style={{ fontSize: "20px" }}>🏪</span>
              <span style={{ fontSize: "10px" }}>매장 안내</span>
            </a>
            <a href="/delivery" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", textDecoration: "none", color: "#374151" }}>
              <span style={{ fontSize: "20px" }}>📦</span>
              <span style={{ fontSize: "10px" }}>배송 확인</span>
            </a>
            <a href="/cart" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", textDecoration: "none", color: "#374151", position: "relative" }}>
              <span style={{ fontSize: "20px" }}>🛒</span>
              <span style={{ fontSize: "10px" }}>내 장바구니</span>
              <span style={{
                position: "absolute", top: "-4px", right: "-4px",
                backgroundColor: "#0082C3", color: "white",
                borderRadius: "50%", width: "16px", height: "16px",
                fontSize: "10px", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontWeight: 700,
              }}>0</span>
            </a>
          </div>
        </div>
      </div>

      {/* Category Nav */}
      <nav style={{ borderBottom: "1px solid #e5e7eb", backgroundColor: "white" }}>
        <div style={{
          maxWidth: "1200px", margin: "0 auto", padding: "0 16px",
          display: "flex", overflowX: "auto",
        }}>
          {navCategories.map((cat) => (
            <a
              key={cat.href}
              href={cat.href}
              style={{
                fontSize: "14px", fontWeight: 500,
                color: (cat as any).color || "#374151",
                textDecoration: "none", padding: "14px 20px",
                whiteSpace: "nowrap", display: "block",
                borderBottom: "2px solid transparent",
              }}
            >
              {cat.label}
            </a>
          ))}
        </div>
      </nav>
    </header>
  );
}
