const footerLinks = {
  "고객 서비스": ["공지사항", "FAQ", "1:1 문의", "반품/교환"],
  "데카트론": ["회사 소개", "채용 정보", "매장 찾기", "지속가능성"],
  "쇼핑 정보": ["배송 안내", "결제 수단", "멤버십", "기업구매"],
};

export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand column */}
          <div>
            <div className="bg-blue-600 text-white font-black text-lg px-3 py-1.5 rounded inline-block mb-4">
              DECATHLON
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              세상의 모든 스포츠.<br />
              프랑스에서 온 글로벌 스포츠 브랜드.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-white font-bold text-sm mb-4">{category}</h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link}>
                    
                      href="#"
                      className="text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-700 mt-10 pt-6 text-xs text-gray-500 text-center">
          © 2026 Decathlon Korea. All rights reserved. | 사업자등록번호: 000-00-00000
        </div>
      </div>
    </footer>
  );
}