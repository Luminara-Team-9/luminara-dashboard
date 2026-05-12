export function Clearance() {
  const products = [
    {
      id: '8947852',
      name: '남성 하프집 하이킹 플리스 MH500 QUECHUA',
      price: 9900,
      originalPrice: 19900,
      badge: 'sale',
      imageUrl:
        'https://contents.mediadecathlon.com/p2924600/sq/k$cf423b616aba772e3e0c4ae7954420df/%EB%82%A8%EC%84%B1-7%EC%9D%B8%EC%B9%98-%EB%9F%AC%EB%8B%9D-%EC%87%BC%EC%B8%A0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-kiprun-8817443.jpg?f=480x480&format=auto',
    },
    {
      id: '8929144',
      name: '남성 하프집 러닝 긴팔 티 런 웜 500 KIPRUN',
      price: 26900,
      originalPrice: 44900,
      badge: 'sale',
      imageUrl:
        'https://contents.mediadecathlon.com/p2906961/sq/k$5687e4d5c5b921c3f9b9e6ed8e421335/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EC%8B%AC%EB%A6%AC%EC%8A%A4-%EA%B8%B4%ED%8C%94-%ED%8B%B0-%EB%9F%B0-500-kiprun-8928516.jpg?f=480x480&format=auto',
    },
    {
      id: '8917647',
      name: '남성 하이킹 포켓 플리스 자켓 MH500 QUECHUA',
      price: 19900,
      originalPrice: 39900,
      badge: 'sale',
      imageUrl:
        'https://contents.mediadecathlon.com/p2516892/sq/k$d1ee673b7d4ee48bd483f4cc963e553f/%EC%97%AC%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EC%9C%88%EB%93%9C-%EC%9E%90%BC%93-%EB%9F%B0-100-kiprun-8817239.jpg?f=480x480&format=auto',
    },
    {
      id: '8915932',
      name: '여성 카본 레이싱화 KD900X.2 KIPRUN',
      price: 79900,
      originalPrice: 139000,
      badge: 'sale',
      imageUrl:
        'https://contents.mediadecathlon.com/p2607279/sq/k$74a19850531d0ec9f8f07de3eb1ac637/%EC%97%AC%EC%84%B1-%ED%95%98%ED%94%84%EC%A7%91-%EB%9F%AC%EB%8B%9D-%EA%B8%B4%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EC%9B%9C-100-kiprun-8394789.jpg?f=480x480&format=auto',
    },
  ];

  return (
    <section style={{ backgroundColor: 'white', padding: '24px 0', marginBottom: '8px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#111827' }}>Clearance</h2>
          <a
            href="/c/clearance"
            style={{ fontSize: '13px', color: '#6b7280', textDecoration: 'none' }}
          >
            전체보기
          </a>
        </div>
        <div
          className="flex overflow-x-auto gap-4 pb-4 snap-x"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {products.map((p) => {
            const discount = Math.round((1 - p.price / p.originalPrice) * 100);
            return (
              /* REPLACED: Changed <a> to <div> and removed href */
              <div
                key={p.id}
                className="flex-none w-[160px] md:w-[240px] snap-start block"
                style={{ cursor: 'default' }}
              >
                <div
                  style={{ backgroundColor: '#f9fafb', borderRadius: '8px', overflow: 'hidden' }}
                >
                  <div style={{ position: 'relative' }}>
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      width={400}
                      height={400}
                      style={{ width: '100%', height: '200px', objectFit: 'cover' }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: '8px',
                        left: '8px',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      Sale
                    </span>
                  </div>
                  <div style={{ padding: '12px' }}>
                    <p
                      className="line-clamp-2"
                      style={{
                        fontSize: '12px',
                        color: '#111827',
                        marginBottom: '8px',
                        lineHeight: '1.4',
                        minHeight: '34px',
                      }}
                    >
                      {p.name}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        gap: '6px',
                        alignItems: 'center',
                        marginBottom: '2px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#9ca3af',
                          textDecoration: 'line-through',
                        }}
                      >
                        {p.originalPrice.toLocaleString()}원
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444' }}>
                        -{discount}%
                      </span>
                    </div>
                    <p style={{ fontSize: '15px', fontWeight: 700 }}>
                      {p.price.toLocaleString()}원
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
