const announcementItems = [
  { text: "멤버십 프로그램 자세히 보기", href: "/s/korea_membership" },
  { text: "매장 안내 위치 보기", href: "/s/our-stores" },
  { text: "5만원 이상 무료배송 자세히 보기", href: "/s/return-and-exchange-1" },
  { text: "데카트론 브랜드 이야기 자세히 보기", href: "/s/about-decathlon-korea" },
];

const navCategories = [
  { label: "러닝", href: "/c/running" },
  { label: "등산", href: "/c/hiking" },
  { label: "필라테스/피트니스", href: "/c/fitness" },
  { label: "캠핑", href: "/c/camping" },
  { label: "킥보드/인라인", href: "/c/scooter" },
  { label: "수영/스노클링", href: "/c/swimming" },
];

export function Header() {
  return (
    <header>
      <div style={{ backgroundColor: "#0082C3", color: "white" }}>
        <div style={{
          maxWidth: "1200px", margin: "0 auto", padding: "8px 16px",
          display: "flex", justifyContent: "center", gap: "32px",
          fontSize: "12px", overflowX: "auto",
        }}>
          {announcementItems.map((item) => (
            <a key={item.href} href={item.href}
              style={{ color: "white", textDecoration: "none", whiteSpace: "nowrap" }}>
              {item.text}
            </a>
          ))}
        </div>
      </div>
      <div style={{
        borderBottom: "1px solid #e5e7eb", backgroundColor: "white",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{
          maxWidth: "1200px", margin: "0 auto", padding: "0 16px",
          height: "64px", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: "16px",
        }}>
          <a href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
            <div style={{
              backgroundColor: "#0082C3", color: "white", fontWeight: 900,
              fontSize: "18px", padding: "6px 12px", borderRadius: "4px",
            }}>
              DECATHLON
            </div>
          </a>
          <div style={{ flex: 1, maxWidth: "560px" }}>
            <div style={{
              display: "flex", border: "2px solid #e5e7eb",
              borderRadius: "999px", overflow: "hidden",
            }}>
              <input type="text" placeholder="스포츠, 브랜드, 제품 검색"
                style={{ flex: 1, padding: "10px 16px", fontSize: "14px",
                  outline: "none", border: "none" }} />
              <button style={{
                backgroundColor: "#0082C3", color: "white", padding: "10px 20px",
                fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer",
              }}>
                검색
              </button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
            <a href="/login" style={{ fontSize: "13px", color: "#374151", textDecoration: "none" }}>
              로그인
            </a>
            <a href="/cart" style={{
              fontSize: "13px", color: "#374151", textDecoration: "none",
              border: "1px solid #374151", padding: "6px 12px", borderRadius: "4px",
            }}>
              장바구니
            </a>
          </div>
        </div>
        <nav style={{ borderTop: "1px solid #f3f4f6" }}>
          <div style={{
            maxWidth: "1200px", margin: "0 auto", padding: "0 16px",
            display: "flex", overflowX: "auto",
          }}>
            {navCategories.map((cat) => (
              <a key={cat.href} href={cat.href} style={{
                fontSize: "14px", fontWeight: 500, color: "#374151",
                textDecoration: "none", padding: "12px 16px",
                whiteSpace: "nowrap", display: "block",
              }}>
                {cat.label}
              </a>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}