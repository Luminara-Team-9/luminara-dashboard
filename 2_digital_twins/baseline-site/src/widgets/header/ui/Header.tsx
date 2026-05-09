import { Button } from "@/shared/ui";

const navLinks = [
  { label: "러닝", href: "/category/running" },
  { label: "수영", href: "/category/swimming" },
  { label: "등산", href: "/category/hiking" },
  { label: "캠핑", href: "/category/camping" },
  { label: "사이클", href: "/category/cycling" },
  { label: "헬스", href: "/category/fitness" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      {/* Top bar */}
      <div className="bg-blue-600 text-white text-xs text-center py-1.5">
        무료배송 ₩50,000 이상 구매시 | 무료반품
      </div>

      {/* Main header */}
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <a href="/" className="flex-shrink-0">
          <div className="bg-blue-600 text-white font-black text-xl px-3 py-1.5 rounded">
            DECATHLON
          </div>
        </a>

        {/* Search bar */}
        <div className="flex-1 max-w-xl">
          <div className="flex items-center border-2 border-gray-200 rounded-full overflow-hidden focus-within:border-blue-500 transition-colors">
            <input
              type="text"
              placeholder="스포츠, 브랜드, 제품 검색"
              className="flex-1 px-4 py-2 text-sm outline-none"
            />
            <button className="bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors">
              검색
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
            로그인
          </button>
          <Button variant="outline" size="sm">
            장바구니 (0)
          </Button>
        </div>
      </div>

      {/* Nav links */}
      <nav className="border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 flex gap-6 overflow-x-auto">
          {navLinks.map((link) => (
            
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-700 hover:text-blue-600 whitespace-nowrap py-3 border-b-2 border-transparent hover:border-blue-600 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
      </nav>
    </header>
  );
}