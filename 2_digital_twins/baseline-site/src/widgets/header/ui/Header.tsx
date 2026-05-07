'use client';

import { useState } from 'react';

const announcementItems = [
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

const navCategories = [
  { label: '모든 스포츠', href: '/c/all-sports' },
  { label: '러닝', href: '/category/running' },
  { label: '등산', href: '/category/hiking' },
  { label: '남성', href: '/category/men' },
  { label: '여성', href: '/category/women' },
  { label: '신제품', href: '/c/ss-new.html', color: '#0082C3' },
  { label: '클리어런스', href: '/c/clearance', color: '#ef4444' },
];

const megaMenuData: Record<
  string,
  { title: string; link: string; items: string[]; image: string }
> = {
  '모든 스포츠': {
    title: '모든 스포츠',
    link: '/c/all-sports',
    items: [
      '러닝',
      '등산',
      '필라테스/피트니스',
      '킥보드/인라인',
      '캠핑',
      '수영/스노클링/서핑',
      '스키/스노우보드',
      '구기/라켓스포츠',
      '자전거',
    ],
    image:
      'https://contents.mediadecathlon.com/p3028235/k$d58416357fd3b51fe1fd04c24674ac4e/2200x1039/5824pt4418/11648xcr5506/KIPRIDE%20MAX%20M%20TEAL%20BLUE%20SS26%20PE26.webp',
  },
  러닝: {
    title: '러닝',
    link: '/category/running',
    items: [
      '신제품',
      '베스트셀러',
      '러닝화',
      '남성',
      '여성',
      '용품',
      '트레일러닝',
      '러닝 클리어런스',
    ],
    image:
      'https://contents.mediadecathlon.com/p3048178/k$8983f233e80f2bcbd10ca3793459d355/2200x1103/5000pt3791/10000xcr5017/KIPRUN%20SHORT%20SPLIT%202%20NOIR%20N07A%20PE26.webp',
  },
  등산: {
    title: '등산',
    link: '/category/hiking',
    items: ['신제품', '베스트셀러', '남성', '여성', '아동', '용품'],
    image:
      'https://contents.mediadecathlon.com/p2861117/k$f230ceac9888cc19f9b50093d1d0d77d/1200x800/QUECHUA%20VESTE%20MH500%20H%20NOIR%20SS25.jpg?format=auto',
  },
  남성: {
    title: '남성',
    link: '/category/men',
    items: ['의류', '신발', '용품'],
    image:
      'https://contents.mediadecathlon.com/p3084816/k$4cbd0c1ff381b453af26fa4e5b2f2f98/2200x1050/4106pt2318/6481xcr3096/KIPRIDE%20H%20BLEU%20PE26%20PE26.webp',
  },
  여성: {
    title: '여성',
    link: '/category/women',
    items: ['의류', '신발', '용품'],
    image:
      'https://contents.mediadecathlon.com/p3082959/k$7871b1f90e1274f2472d4becff37efd8/2100x1019/4169pt1864/7678xcr3729/KIPRUN%20KIPSUMMIT%20F%20VERT%20PE26.webp',
  },
};

export function Header() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: 'white' }}>
      {/* Main Header */}
      <div style={{ borderBottom: '1px solid #e5e7eb' }}>
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0 16px',
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          {/* Logo */}
          <a href="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
            <div
              style={{
                backgroundColor: '#0082C3',
                color: 'white',
                fontWeight: 900,
                fontSize: '18px',
                padding: '6px 12px',
                borderRadius: '4px',
                letterSpacing: '-0.5px',
              }}
            >
              DECATHLON
            </div>
          </a>

          {/* Search - centered and wide */}
          <div style={{ flex: 1, maxWidth: '640px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                border: '2px solid #e5e7eb',
                borderRadius: '999px',
                overflow: 'hidden',
                backgroundColor: 'white',
              }}
            >
              <span style={{ padding: '0 12px', color: '#9ca3af', fontSize: '18px' }}>🔍</span>
              <input
                type="text"
                placeholder="공식 리뷰 작성 시 500 포인트 증정!"
                style={{
                  flex: 1,
                  padding: '10px 0',
                  fontSize: '14px',
                  outline: 'none',
                  border: 'none',
                  backgroundColor: 'transparent',
                }}
              />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
            <a
              href="/login"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                textDecoration: 'none',
                color: '#374151',
              }}
            >
              <span style={{ fontSize: '20px' }}>👤</span>
              <span style={{ fontSize: '10px' }}>로그인</span>
            </a>
            <a
              href="/s/our-stores"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                textDecoration: 'none',
                color: '#374151',
              }}
            >
              <span style={{ fontSize: '20px' }}>🏪</span>
              <span style={{ fontSize: '10px' }}>매장 안내</span>
            </a>
            <a
              href="/delivery"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                textDecoration: 'none',
                color: '#374151',
              }}
            >
              <span style={{ fontSize: '20px' }}>📦</span>
              <span style={{ fontSize: '10px' }}>배송 확인</span>
            </a>
            <a
              href="/cart"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                textDecoration: 'none',
                color: '#374151',
                position: 'relative',
              }}
            >
              <span style={{ fontSize: '20px' }}>🛒</span>
              <span style={{ fontSize: '10px' }}>내 장바구니</span>
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  backgroundColor: '#0082C3',
                  color: 'white',
                  borderRadius: '50%',
                  width: '16px',
                  height: '16px',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                }}
              >
                0
              </span>
            </a>
          </div>
        </div>
      </div>

      {/* Category Nav */}
      <nav style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: 'white' }}>
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0 16px',
            display: 'flex',
            overflowX: 'auto',
          }}
        >
          {navCategories.map((cat) => {
            const hasMenu = !!megaMenuData[cat.label];
            const isActive = activeMenu === cat.label;

            return (
              <div key={cat.href}>
                {hasMenu ? (
                  <button
                    onClick={() => setActiveMenu(isActive ? null : cat.label)}
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: (cat as any).color || '#374151',
                      padding: '14px 20px',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      borderBottom: isActive ? '2px solid #0082C3' : '2px solid transparent',
                    }}
                  >
                    {cat.label}
                    <svg
                      width="10"
                      height="6"
                      viewBox="0 0 10 6"
                      fill="none"
                      style={{
                        transform: isActive ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease-in-out',
                      }}
                    >
                      <path
                        d="M1 1L5 5L9 1"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : (
                  <a
                    href={cat.href}
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: (cat as any).color || '#374151',
                      textDecoration: 'none',
                      padding: '14px 20px',
                      whiteSpace: 'nowrap',
                      display: 'block',
                      borderBottom: '2px solid transparent',
                    }}
                  >
                    {cat.label}
                  </a>
                )}
              </div>
            );
          })}
        </div>
        {activeMenu && megaMenuData[activeMenu] && (
          <>
            {/* Dark Background Overlay */}
            <div
              className="fixed left-0 right-0 bottom-0 bg-black/50 z-40"
              style={{ top: '112px' }}
              onClick={() => setActiveMenu(null)} // Close when clicking the dark background!
            />
            {/* Floating White Modal Box */}
            <div
              className="absolute left-1/2 -translate-x-1/2 w-[95%] max-w-[1100px] bg-white rounded-xl shadow-2xl z-50 flex overflow-hidden border border-gray-200"
              style={{ top: '100%', marginTop: '12px', height: '480px' }}
            >
              {/* Left Side: Category List */}
              <div className="w-[30%] flex flex-col p-8 bg-white">
                <div className="flex justify-between items-end border-b-2 border-black pb-2 mb-4">
                  <h3 className="font-bold text-lg text-gray-900">모든 스포츠</h3>
                  <a href="/c/all-sports" className="text-xs text-gray-500 hover:underline">
                    모두 보기
                  </a>
                </div>
                <div className="overflow-y-auto pr-4" style={{ scrollbarWidth: 'none' }}>
                  {megaMenuData[activeMenu].items.map((item) => (
                    <div
                      key={item}
                      className="flex justify-between items-center py-3.5 border-b border-gray-100 cursor-pointer hover:font-bold text-sm text-gray-700 transition-all"
                    >
                      <span>{item}</span>
                      <span className="text-gray-400 font-light">›</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Side: Large Image */}
              <div className="w-[70%] relative bg-gray-100">
                <img
                  src={megaMenuData[activeMenu].image}
                  alt={`${activeMenu} Promo`}
                  className="w-full h-full object-cover"
                />
                {/* Close 'X' Button in Top Right */}
                <button
                  onClick={() => setActiveMenu(null)}
                  className="absolute top-4 right-4 bg-white/80 hover:bg-white text-gray-900 rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg shadow-sm transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          </>
        )}
      </nav>
    </header>
  );
}
