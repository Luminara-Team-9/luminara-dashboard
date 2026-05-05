const circles = [
  { label: '첫 구매라면?', href: '/c/first-choice.html', color: '#0082C3' },
  { label: '신제품', href: '/c/ss-new.html', color: '#10b981' },
  { label: '러닝 베스트셀러', href: '/c/running-bestseller.html', color: '#f97316' },
  { label: '하이킹 베스트셀러', href: '/c/hiking-bestseller.html', color: '#84cc16' },
  { label: '러닝화', href: '/c/running-shoes.html', color: '#3b82f6' },
  { label: '바람막이', href: '/c/windbreaker.html', color: '#8b5cf6' },
  { label: '러닝 쇼츠', href: '/c/running-shorts.html', color: '#ec4899' },
  { label: '하이킹 백팩', href: '/c/hiking-backpack.html', color: '#14b8a6' },
  { label: '선글라스', href: '/c/sunglasses.html', color: '#f59e0b' },
  { label: '러닝 모자', href: '/c/running-cap.html', color: '#6366f1' },
];

export function CircleBanners() {
  return (
    <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
        {circles.map((item) => (
          <a
            key={item.href}
            href={item.href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              textDecoration: 'none',
              flexShrink: 0,
              width: '80px',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: item.color,
                border: '2px solid ' + item.color,
              }}
            />
            <span
              style={{
                fontSize: '11px',
                color: '#374151',
                textAlign: 'center',
                lineHeight: '1.3',
              }}
            >
              {item.label}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
