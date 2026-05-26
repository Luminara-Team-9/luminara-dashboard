export function AnnouncementBar() {
  const items = [
    { icon: '🔄', text: '멤버십 프로그램', subText: '자세히 보기', href: '/s/korea_membership' },
    { icon: '📍', text: '매장 안내', subText: '위치 보기', href: '/s/our-stores' },
    {
      icon: '🚚',
      text: '5만원 이상 무료배송',
      subText: '자세히 보기',
      href: '/s/return-and-exchange-1',
    },
    {
      icon: 'ℹ️',
      text: '데카트론 브랜드 이야기',
      subText: '자세히 보기',
      href: '/s/about-decathlon-korea',
    },
  ];

  return (
    // 'hidden md:block' ensures this is completely invisible on mobile, but shows on Web
    <div className="hidden md:block bg-[#f3f4f6] border-b border-[#e5e7eb]">
      <div className="max-w-[1200px] mx-auto grid grid-cols-4">
        {items.map((item, i) => (
          <a
            key={i}
            href={item.href}
            className={`flex items-center gap-3 p-4 no-underline ${
              i < 3 ? 'border-r border-[#e5e7eb]' : ''
            }`}
          >
            <span className="text-2xl">{item.icon}</span>
            <div>
              <div className="text-[13px] font-semibold text-[#111827]">{item.text}</div>
              <div className="text-[12px] text-[#0082C3]">{item.subText} &gt;</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
