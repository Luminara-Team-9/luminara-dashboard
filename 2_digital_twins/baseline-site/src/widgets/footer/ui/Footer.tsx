const footerSections = {
  "데카트론 소개": [
    { text: "About Decathlon", href: "/s/about-decathlon-korea" },
    { text: "채용 정보", href: "https://decathlon.ninehire.site" },
    { text: "매장 안내", href: "/s/our-stores" },
  ],
  "멤버십": [
    { text: "멤버 혜택", href: "/s/korea_membership" },
    { text: "포인트 사용 안내", href: "/s/how-to-use-points" },
    { text: "멤버십 서비스 이용약관", href: "/s/terms-of-use-membership" },
  ],
  "고객 서비스": [
    { text: "FAQ", href: "/s/faq-Kor" },
    { text: "배송 및 반품 정책", href: "/s/return-and-exchange" },
    { text: "수리 및 보증 정책", href: "/s/repair-warranty" },
    { text: "공지사항", href: "/s/dashboard" },
  ],
  "구매 안내": [
    { text: "대량 구매 안내", href: "/s/bulk-order" },
    { text: "구매 이용 약관", href: "/s/terms-of-sale" },
    { text: "개인정보 처리방침", href: "/s/privacy-policy-1" },
  ],
};

export function Footer() {
  return (
    <footer style={{ backgroundColor: "#111827", color: "#9ca3af", marginTop: "64px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "48px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "32px" }}>
          <div>
            <div style={{
              backgroundColor: "#0082C3",
              color: "white",
              fontWeight: 900,
              fontSize: "16px",
              padding: "6px 12px",
              borderRadius: "4px",
              display: "inline-block",
              marginBottom: "16px",
            }}>
              DECATHLON
            </div>
            <p style={{ fontSize: "12px", lineHeight: "1.6" }}>
              세상의 모든 스포츠.<br />프랑스에서 온 글로벌 스포츠 브랜드.
            </p>
          </div>
          {Object.entries(footerSections).map(([title, links]) => (
            <div key={title}>
              <h4 style={{ color: "white", fontWeight: 700, fontSize: "13px", marginBottom: "12px" }}>
                {title}
              </h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {links.map((link) => (
                  <li key={link.href} style={{ marginBottom: "8px" }}>
                    <a href={link.href} style={{ color: "#9ca3af", textDecoration: "none", fontSize: "12px" }}>
                      {link.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{
          borderTop: "1px solid #374151",
          marginTop: "40px",
          paddingTop: "24px",
          fontSize: "11px",
          textAlign: "center",
          color: "#6b7280",
        }}>
          2026 Decathlon Korea Co., Ltd. | 사업자등록번호: 220-81-11264
        </div>
      </div>
    </footer>
  );
}
