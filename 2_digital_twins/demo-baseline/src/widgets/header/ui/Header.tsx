'use client';

import { useState } from 'react';

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
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: 'white' }}>
      <div style={{ borderBottom: '1px solid #e5e7eb' }}>
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0 16px',
            height: '80px',
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
                color: '#0055A4',
                fontWeight: 900,
                fontSize: '28px',
                fontStyle: 'italic',
                letterSpacing: '-1px',
              }}
            >
              DECATHLON
            </div>
          </a>

          {/* Search */}
          <div style={{ flex: 1, maxWidth: '640px', position: 'relative' }}>
            <div
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                border: '2px solid transparent',
                borderRadius: '999px',
                overflow: 'hidden',
                backgroundColor: '#F3F4F6',
                padding: '12px 24px',
                cursor: 'text',
              }}
            >
              <span style={{ color: '#9ca3af', fontSize: '18px', marginRight: '12px' }}>🔍</span>
              <input
                type="text"
                placeholder="공식 리뷰 작성 시 500 포인트 증정!"
                readOnly
                style={{
                  flex: 1,
                  fontSize: '14px',
                  outline: 'none',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              />
              {isSearchOpen && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSearchOpen(false);
                  }}
                  style={{ color: '#9ca3af', cursor: 'pointer', marginLeft: '12px' }}
                >
                  ✕
                </span>
              )}
            </div>

            {isSearchOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '60px',
                  left: 0,
                  width: '100%',
                  backgroundColor: 'white',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '24px',
                  zIndex: 50,
                  display: 'flex',
                  gap: '24px',
                }}
              >
                <div style={{ width: '33%', borderRight: '1px solid #f3f4f6' }}>
                  <h3 style={{ fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>
                    인기 검색어
                  </h3>
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      fontSize: '14px',
                      color: '#4b5563',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <li>
                      베스트셀러{' '}
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                        | 모든 스포츠 / 러닝
                      </span>
                    </li>
                    <li>
                      신제품{' '}
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                        | 모든 스포츠 / 등산
                      </span>
                    </li>
                  </ul>
                </div>
                <div style={{ width: '66%' }}>
                  <h3 style={{ fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>
                    인기 상품
                  </h3>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                    [인기 상품 리스트 표시 영역]
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
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
              <span style={{ fontSize: '20px' }}>🏬</span>
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
                  backgroundColor: '#0055A4',
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
            justifyContent: 'center',
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
                      color: cat.color || '#374151',
                      padding: '14px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      borderBottom: isActive ? '2px solid #0055A4' : '2px solid transparent',
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
                        transition: 'transform 0.2s',
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
                      color: cat.color || '#374151',
                      textDecoration: 'none',
                      padding: '14px 20px',
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

        {/* Mega Menu */}
        {activeMenu && megaMenuData[activeMenu] && (
          <>
            <div
              style={{
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                zIndex: 40,
                top: '128px',
              }}
              onClick={() => setActiveMenu(null)}
            />
            <div
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '95%',
                maxWidth: '1100px',
                backgroundColor: 'white',
                borderRadius: '12px',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                zIndex: 50,
                display: 'flex',
                overflow: 'hidden',
                border: '1px solid #e5e7eb',
                top: '100%',
                marginTop: '12px',
                height: '480px',
              }}
            >
              <div
                style={{
                  width: '30%',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '32px',
                  backgroundColor: 'white',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    borderBottom: '2px solid black',
                    paddingBottom: '8px',
                    marginBottom: '16px',
                  }}
                >
                  <h3 style={{ fontWeight: 700, fontSize: '18px', color: '#111827' }}>
                    {megaMenuData[activeMenu].title}
                  </h3>
                  <a
                    href={megaMenuData[activeMenu].link}
                    style={{ fontSize: '12px', color: '#6b7280', textDecoration: 'underline' }}
                  >
                    모두 보기
                  </a>
                </div>
                <div style={{ overflowY: 'auto', paddingRight: '16px' }}>
                  {megaMenuData[activeMenu].items.map((item) => (
                    <div
                      key={item}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 0',
                        borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: '#374151',
                      }}
                    >
                      <span>{item}</span>
                      <span style={{ color: '#9ca3af' }}>›</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ width: '70%', position: 'relative', backgroundColor: '#f3f4f6' }}>
                <img
                  src={megaMenuData[activeMenu].image}
                  alt={`${activeMenu} Promo`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <button
                  onClick={() => setActiveMenu(null)}
                  style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    backgroundColor: 'rgba(255,255,255,0.8)',
                    color: '#111827',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '18px',
                    border: 'none',
                    cursor: 'pointer',
                  }}
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
