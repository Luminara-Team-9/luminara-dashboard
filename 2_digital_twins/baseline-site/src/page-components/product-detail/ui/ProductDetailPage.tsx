'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/header';
import { Footer } from '@/widgets/footer';
import { runningProducts } from '@/page-components/main-landing/ui/mockData';

const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const defaultProduct = {
  name: '남성 러닝 반팔 티 런 드라이 100',
  price: 5900,
  originalPrice: 9900,
  brand: 'DECATHLON',
  rating: 4.7,
  reviewCount: 25387,
  category: '러닝',
  description:
    '빠른 수분 증발로 운동 중에도 쾌적함을 유지해 주는 남성 러닝 반팔 티셔츠입니다. 가볍고 통기성이 뛰어나 장거리 러닝에 적합합니다.',
  images: [
    'https://contents.mediadecathlon.com/p2924641/k$67d6b1e1b55aa3217970880ea31408c6/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.jpg?f=1024x0&format=auto',
    'https://contents.mediadecathlon.com/p2924641/sq/k$67d6b1e1b55aa3217970880ea31408c6/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.jpg?f=480x480&format=auto',
    'https://contents.mediadecathlon.com/p2893372/sq/k$c24e116895b526b86dd2be3edd16b31c/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-500-kiprun-8861547.jpg?f=480x480&format=auto',
    'https://contents.mediadecathlon.com/p3024603/sq/k$141328d72603a9e2afd0ec1d419949dd/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EA%B2%BD%EB%9F%89-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%9D%BC%EC%9D%B4%ED%8A%B8-900-kiprun-8978072.jpg?f=480x480&format=auto',
  ],
};

export function ProductDetailPage({ productId }: { productId: string }) {
  const [showStickyCart, setShowStickyCart] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // If the user scrolls down 600px (past the main buy button), show the sticky bar
      if (window.scrollY > 600) {
        setShowStickyCart(true);
      } else {
        setShowStickyCart(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const baseProduct = runningProducts.find((p) => p.id === productId);

  // If someone types a random ID in the URL, show a 404 message
  if (!baseProduct) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9fafb',
        }}
      >
        <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>
          상품을 찾을 수 없습니다 (Product Not Found)
        </h1>
      </div>
    );
  }

  const product = {
    ...baseProduct,
    brand: (baseProduct as any).brand || 'DECATHLON',
    rating: (baseProduct as any).rating || 4.7,
    reviewCount: 25387,
    description:
      '빠른 수분 증발로 운동 중에도 쾌적함을 유지해 주는 기능성 제품입니다. 가볍고 통기성이 뛰어나 장거리 러닝 및 야외 활동에 적합합니다.',
    images: [
      baseProduct.imageUrl,
      'https://contents.mediadecathhttps://contents.mediadecathlon.com/p2924608/k$cdfa71179629430eba2f8a6ad0cbafb2/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.jpg?f=1024x0&format=autolon.com/p2893372/sq/k$c24e116895b526b86dd2be3edd16b31c/defaut.jpg?f=480x480&format=auto',
      'https://contents.mediadecathlon.com/p3024603/sq/k$141328d72603a9https://contents.mediadecathlon.com/p2788391/k$ad0ddad8b73ae33aa4ebd7d4b1b8f89e/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.jpg?f=1920x0&format=autoe2afd0ec1d419949dd/defaut.jpg?f=480x480&format=auto',
      'https://contents.mediadecathlon.com/p2788392/k$86aa3570e8b37040c80a94bd5c7a43a9/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.jpg?f=1920x0&format=auto',
    ],
  };

  const discount = product.originalPrice
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#white' }}>
      <Header />
      <main className="max-w-[1200px] mx-auto px-4 py-6">
        <div className="flex gap-2 text-sm text-gray-500 mb-6">
          <Link href="/" style={{ color: '#6b7280', textDecoration: 'none' }}>
            홈
          </Link>
          <span>{'>'}</span>
          <Link href="/category/running" style={{ color: '#6b7280', textDecoration: 'none' }}>
            {product.category}
          </Link>
          <span>{'>'}</span>
          <span style={{ color: '#111827' }}>{product.name}</span>
        </div>
        <div className="flex flex-col lg:flex-row gap-12 relative">
          {/* LEFT: 2x2 Image Grid (Like Real Decathlon) */}
          <div className="w-full lg:w-2/3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {product.images.map((img, i) => (
                <div key={i} className="bg-[#f5f5f5] aspect-[3/4] overflow-hidden">
                  <img
                    src={img}
                    alt={`${product.name} ${i + 1}`}
                    className="w-full h-full object-cover mix-blend-multiply"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Sticky Product Details */}
          <div className="w-full lg:w-1/3">
            <div className="sticky top-6">
              {/* Badge & Brand */}
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-yellow-400 text-black text-xs font-bold px-2 py-1">Sale</span>
              </div>
              <p className="text-sm text-gray-500 mb-1">
                {product.brand} | 모델번호: {product.id}
              </p>

              {/* Title & Rating */}
              <h1 className="text-2xl font-black text-gray-900 mb-2">{product.name}</h1>
              <div className="flex items-center gap-2 text-sm mb-6">
                <span className="text-yellow-400">★</span>
                <span className="font-bold">{product.rating}</span>
                <span className="text-gray-500">({product.reviewCount.toLocaleString()})</span>
              </div>

              {/* Price */}
              <div className="flex items-end gap-3 mb-8">
                <span className="text-3xl font-black text-gray-900">
                  {product.price.toLocaleString()}원
                </span>
                {product.originalPrice && (
                  <>
                    <span className="text-lg text-gray-400 line-through mb-1">
                      {product.originalPrice.toLocaleString()}원
                    </span>
                    <span className="bg-yellow-400 text-black text-sm font-bold px-2 py-0.5 mb-1">
                      -{discount}%
                    </span>
                  </>
                )}
              </div>

              {/* NEW: Size Dropdown */}
              <div className="mb-8">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-gray-900">사이즈:</span>
                  <a href="#" className="text-sm text-blue-600 underline">
                    내 사이즈 찾기
                  </a>
                </div>
                <select className="w-full border border-gray-300 rounded-md p-4 text-sm bg-white outline-none focus:border-blue-600 cursor-pointer appearance-none">
                  <option>사이즈를 선택하세요</option>
                  {sizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>

              {/* Buttons */}
              <Link href="/cart">
                <button className="w-full bg-[#3543b4] hover:bg-blue-800 text-white font-bold py-4 rounded-md mb-3 transition-colors">
                  장바구니 담기
                </button>
              </Link>
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: '32px',
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 900, marginBottom: '16px' }}>연관 상품</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            {[
              {
                id: '8861547',
                name: '남성 러닝 반팔 티 런 드라이 500',
                price: 24900,
                img: 'https://contents.mediadecathlon.com/p2893372/sq/k$c24e116895b526b86dd2be3edd16b31c/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-500-kiprun-8861547.jpg?f=480x480&format=auto',
              },
              {
                id: '8817443',
                name: '남성 7인치 러닝 쇼츠 런 드라이 100',
                price: 9900,
                img: 'https://contents.mediadecathlon.com/p2924600/sq/k$cf423b616aba772e3e0c4ae7954420df/%EB%82%A8%EC%84%B1-7%EC%9D%B8%EC%B9%98-%EB%9F%AC%EB%8B%9D-%EC%87%BC%EC%B8%A0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-kiprun-8817443.jpg?f=480x480&format=auto',
              },
              {
                id: '8810971',
                name: '러닝 얇은 중목 양말 2켤레',
                price: 7900,
                img: 'https://contents.mediadecathlon.com/p3005201/sq/k$c00c197e3ba329d8521e4f49ba80fd82/%EB%9F%AC%EB%8B%9D-%EC%96%87%EC%9D%80-%EC%A4%91%EB%AA%A9-%EC%96%91%EB%A7%90-2%EC%BC%A4%EB%A0%88-%ED%8C%8C%EC%9D%B8-%EB%9F%B0-500-kiprun-8810971.jpg?f=480x480&format=auto',
              },
              {
                id: '8882166',
                name: '러닝 쿨링 헤드밴드',
                price: 7900,
                img: 'https://contents.mediadecathlon.com/p2644659/sq/k$46370da423f768ee056d2e9400467100/%EB%9F%AC%EB%8B%9D-%EC%BF%A8%EB%A7%81-%ED%97%A4%EB%93%9C%EB%B0%B4%EB%93%9C-kiprun-8882166.jpg?f=480x480&format=auto',
              },
            ].map((item) => (
              <Link key={item.id} href={`/product/${item.id}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{ backgroundColor: '#f9fafb', borderRadius: '8px', overflow: 'hidden' }}
                >
                  <img
                    src={item.img}
                    alt={item.name}
                    width={300}
                    height={300}
                    style={{ width: '100%', height: '200px', objectFit: 'cover' }}
                  />
                  <div style={{ padding: '12px' }}>
                    <p style={{ fontSize: '12px', color: '#374151', marginBottom: '4px' }}>
                      {item.name}
                    </p>
                    <p style={{ fontSize: '14px', fontWeight: 700 }}>
                      {item.price.toLocaleString()}원
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div
          className={`fixed top-[112px] left-0 right-0 bg-white border-t border-gray-200 shadow-2xl z-50 p-4 transform transition-transform duration-300 ${
            showStickyCart ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-4">
            {/* Left side: Image & Title (Hidden on tiny mobile screens) */}
            <div className="hidden md:flex items-center gap-4">
              <img
                src={product.images[0]}
                alt={product.name}
                className="w-12 h-16 object-cover bg-gray-100"
              />
              <div>
                <p className="text-sm font-bold text-gray-900">{product.name}</p>
                <p className="text-lg font-black text-gray-900">
                  {product.price.toLocaleString()}원
                </p>
              </div>
            </div>

            {/* Right side: Size & Button */}
            <div className="flex flex-1 md:flex-none items-center gap-4 w-full md:w-auto">
              <select className="flex-1 md:w-48 border border-gray-300 rounded p-3 text-sm bg-white">
                <option>사이즈 선택</option>
                {sizes.map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
              <Link href="/cart" className="flex-1 md:flex-none">
                <button className="w-full bg-[#3543b4] text-white font-bold py-3 px-8 rounded hover:bg-blue-800 transition-colors">
                  장바구니 담기
                </button>
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
