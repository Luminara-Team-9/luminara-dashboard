export function HikerProducts() {
  const products = [
    {
      id: '8926332',
      name: '남성 하이킹 투인원 집오프 바지 MH500 QUECHUA',
      price: 64900,
      brand: 'QUECHUA',
      rating: 4.7,
      imageUrl:
        'https://contents.mediadecathlon.com/p2788602/sq/k$22fc90a7b212213db553e78e1731ef7b/%EB%82%A8%EC%84%B1-8%EC%9D%B8%EC%B9%98-%EB%9F%AC%EB%8B%9D-%EA%B2%BD%EB%9F%89-%EC%87%BC%EC%B8%A0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-%ED%94%8C%EB%9F%AC%EC%8A%A4-500-kiprun-8751038.jpg?f=480x480&format=auto',
    },
    {
      id: '8853743',
      name: '남성 백패킹 투인원 집오프 바지 MT500 SIMOND',
      price: 64900,
      brand: 'SIMOND',
      rating: 4.8,
      imageUrl:
        'https://contents.mediadecathlon.com/p2612825/sq/k$73d99f4c09b202821cc9cc7162090a9b/%ED%95%98%EC%9D%B4%ED%82%B9-%EA%B2%BD%EB%9F%89-%EB%B0%B1%ED%8C%A9-22l-mh500-%EB%9D%BC%EC%9D%B4%ED%8A%B8-quechua-8826305.jpg?f=480x480&format=auto',
    },
    {
      id: '8970485',
      name: '남성 경량 로우컷 하이킹화 패스터 MH500 QUECHUA',
      price: 129000,
      brand: 'QUECHUA',
      rating: 4.6,
      imageUrl:
        'https://contents.mediadecathlon.com/p2966107/sq/k$71853bbcb9cdaf90ad31148656afe201/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EC%9C%88%EB%93%9C-%EC%9E%90%BC%93-%EB%9F%B0-100-kiprun-8926414.jpg?f=480x480&format=auto',
    },
    {
      id: '8926690',
      name: '여성 하이킹 카고 바지 NH900 QUECHUA',
      price: 64900,
      brand: 'QUECHUA',
      rating: 4.9,
      imageUrl:
        'https://contents.mediadecathlon.com/p2924625/sq/k$075f676a46105380a29b78ea3e357788/%EC%97%AC%EC%84%B1-4%EC%9D%B8%EC%B9%98-%EB%9F%AC%EB%8B%9D-%EC%87%BC%EC%B8%A0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-kalenji-8553338.jpg?f=480x480&format=auto',
    },
    {
      id: '8916237',
      name: '하이킹 경량 백팩 25L MH900 QUECHUA',
      price: 129000,
      brand: 'QUECHUA',
      rating: 4.8,
      imageUrl:
        'https://contents.mediadecathlon.com/p2612825/sq/k$73d99f4c09b202821cc9cc7162090a9b/%ED%95%98%EC%9D%B4%ED%82%B9-%EA%B2%BD%EB%9F%89-%EB%B0%B1%ED%8C%A9-22l-mh500-%EB%9D%BC%EC%9D%B4%ED%8A%B8-quechua-8826305.jpg?f=480x480&format=auto',
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
          <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#111827' }}>
            Real {"Hiker's"} Choice
          </h2>
          <a
            href="/c/hiking"
            style={{ fontSize: '13px', color: '#6b7280', textDecoration: 'none' }}
          >
            전체보기
          </a>
        </div>
        <div
          className="flex overflow-x-auto gap-4 pb-4 snap-x"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {products.map((p) => (
            <div
              key={p.id}
              className="flex-none w-[160px] md:w-[240px] snap-start block"
              style={{ cursor: 'default' }}
            >
              <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', overflow: 'hidden' }}>
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  width={400}
                  height={400}
                  style={{ width: '100%', height: '200px', objectFit: 'cover' }}
                />
                <div style={{ padding: '12px' }}>
                  <p style={{ fontSize: '11px', color: '#0082C3', marginBottom: '4px' }}>
                    {p.brand}
                  </p>
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
                  <p style={{ fontSize: '15px', fontWeight: 700 }}>{p.price.toLocaleString()}원</p>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}
                  >
                    <span style={{ color: '#fbbf24', fontSize: '11px' }}>★</span>
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>{p.rating}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
