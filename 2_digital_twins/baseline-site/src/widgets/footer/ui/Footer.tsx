const footerSections = [
  {
    title: "회사 소개",
    links: [
      { text: "About Decathlon", href: "/s/about-decathlon-korea" },
      { text: "채용 정보", href: "https://decathlon.ninehire.site" },
      { text: "매장 안내", href: "/s/our-stores" },
    ],
  },
  {
    title: "멤버십",
    links: [
      { text: "멤버 혜택", href: "/s/korea_membership" },
      { text: "포인트 사용 안내", href: "/s/how-to-use-points" },
      { text: "멤버십 서비스 이용약관", href: "/s/terms-of-use-membership" },
    ],
  },
  {
    title: "구매 정보",
    links: [
      { text: "대량 구매 안내", href: "/s/bulk-order" },
      { text: "구매 이용 약관", href: "/s/terms-of-sale" },
      { text: "개인정보 처리방침", href: "/s/privacy-policy-1" },
    ],
  },
  {
    title: "고객 서비스",
    links: [
      { text: "FAQ", href: "/s/faq-Kor" },
      { text: "배송 및 반품 정책", href: "/s/return-and-exchange" },
      { text: "수리 및 보증 정책", href: "/s/repair-warranty" },
      { text: "공지사항", href: "/s/dashboard" },
    ],
  },
];

export function Footer() {
  return (
    <footer style={{ backgroundColor: "white", borderTop: "8px solid #f3f4f6", marginTop: "24px" }}>
      {/* Accordion sections */}
      <div style={{ borderBottom: "1px solid #e5e7eb" }}>
        {footerSections.map((section) => (
          <div key={section.title} style={{ borderTop: "1px solid #e5e7eb" }}>
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between",
              padding: "16px", cursor: "pointer",
            }}>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "#111827" }}>
                {section.title}
              </span>
              <span style={{ color: "#9ca3af" }}>{">"}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom section */}
      <div style={{ backgroundColor: "#111827", color: "white", padding: "32px 16px" }}>
        <div style={{
          maxWidth: "1200px", margin: "0 auto",
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: "32px",
        }}>
          {/* Follow Us */}
          <div>
            <h4 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "16px" }}>Follow Us</h4>
            <div style={{ display: "flex", gap: "12px" }}>
              {["📘", "📸", "▶️", "💬"].map((icon, i) => (
                <a key={i} href="#" style={{
                  width: "36px", height: "36px", borderRadius: "50%",
                  backgroundColor: "#374151",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  textDecoration: "none", fontSize: "16px",
                }}>
                  {icon}
                </a>
              ))}
            </div>
          </div>

          {/* App Download */}
          <div>
            <h4 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "16px" }}>데카트론 App 다운로드</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <img
                src="https://contents.mediadecathlon.com/s1012444/k$f9cd9f79c6b583f1c842884359c0843e/app%20store%20button%20tr.svg?format=auto"
                alt="App Store"
                width={120}
                height={36}
                style={{ height: "36px", width: "auto" }}
              />
              <img
                src="https://contents.mediadecathlon.com/s815544/k$f30b23aeb9d31e68b3c76fa12cf5ab82/google%20play%20badge.png?format=auto"
                alt="Google Play"
                width={120}
                height={36}
                style={{ height: "36px", width: "auto" }}
              />
            </div>
          </div>

          {/* 사업자 정보 */}
          <div>
            <h4 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px" }}>사업자 정보</h4>
            <p style={{ fontSize: "11px", color: "#9ca3af", lineHeight: "1.8" }}>
              주식회사 데카트론코리아(DECATHLON KOREA CO.,LTD.)<br />
              대표: 구자민 | 서울특별시 서초구 서초대로 396<br />
              사업자등록번호 220-81-11264 | 통신판매업신고번호 2024-서울강남-01993<br />
              오성 제공사: Google Cloud | 대표번호: 1800-2025
            </p>
          </div>
        </div>

        <div style={{
          maxWidth: "1200px", margin: "24px auto 0",
          paddingTop: "24px", borderTop: "1px solid #374151",
          fontSize: "11px", color: "#6b7280", textAlign: "center",
        }}>
          2026 Decathlon Korea Co., Ltd. | 사업자등록번호: 220-81-11264
        </div>
      </div>
    </footer>
  );
}
