'use client';

import { useState, useEffect } from 'react';
import { track } from '@/shared/analytics';

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
    link: '/category/all-sports',
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
  const [cartCount, setCartCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // Mobile Drawer State

  useEffect(() => {
    // Function to calculate total items in the cart
    const updateCartCount = () => {
      const cart = JSON.parse(localStorage.getItem('decathlon_cart') || '[]');
      const totalItems = cart.reduce((sum: number, item: any) => sum + item.quantity, 0);
      setCartCount(totalItems);
    };

    // 1. Run immediately on page load to prevent showing 0
    updateCartCount();

    // 2. Listen for events from ProductCard and PDP
    window.addEventListener('cart-updated', updateCartCount);

    return () => {
      window.removeEventListener('cart-updated', updateCartCount);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm">
      <div className="border-b border-gray-200">
        <div className="max-w-[1200px] mx-auto px-4 h-16 md:h-20 flex items-center justify-between gap-4">
          {/* Mobile Hamburger Menu */}
          <button
            className="md:hidden text-gray-700 p-1 flex-shrink-0 cursor-pointer"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          <a href="/" className="shrink-0 no-underline">
            <div className="text-[#0055A4] font-black text-xl md:text-[28px] italic tracking-tight">
              DECATHLON
            </div>
          </a>

          {/* Search */}
          <div className="flex-1 max-w-[640px] relative hidden md:block">
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
          <div className="flex items-center gap-4 md:gap-5 shrink-0">
            <a
              href="/login"
              className="hidden md:flex flex-col items-center gap-1 no-underline text-gray-700"
            >
              <span className="text-xl">👤</span>
              <span className="text-[10px]">로그인</span>
            </a>
            <a
              href="/s/our-stores"
              className="hidden md:flex flex-col items-center gap-1 no-underline text-gray-700"
            >
              <span className="text-xl">🏬</span>
              <span className="text-[10px]">매장 안내</span>
            </a>
            <a href="/cart" className="flex flex-col items-center gap-1 no-underline text-gray-700">
              <div className="relative flex">
                <span className="text-[22px] leading-none">🛒</span>
                <span className="absolute -top-1.5 -right-2 bg-[#0055A4] text-white rounded-full w-[18px] h-[18px] text-[10px] flex items-center justify-center font-bold">
                  {cartCount}
                </span>
              </div>
              <span className="text-[11px] font-medium whitespace-nowrap hidden md:block">
                내 장바구니
              </span>
            </a>
          </div>
        </div>
      </div>

      {/* Mobile Search Bar (Only shows below header on phones) */}
      <div className="p-2 md:hidden border-b border-gray-200 bg-white">
        <div className="flex items-center rounded-lg bg-gray-100 py-2 px-3">
          <span className="text-gray-400 mr-2 text-sm">🔍</span>
          <input
            type="text"
            placeholder="검색"
            className="flex-1 text-sm bg-transparent outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                track({
                  ev: 'search_query',
                  meta: { search_term: e.currentTarget.value },
                });
              }
            }}
          />
        </div>
      </div>

      {/* Category Nav */}
      <nav className="border-b border-gray-200 bg-white hidden md:block relative">
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
              {activeMenu === '모든 스포츠' ? (
                /* --- 3-COLUMN LAYOUT (모든 스포츠) --- */
                <>
                  <div
                    style={{
                      width: '25%',
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '24px 0 24px 24px',
                      backgroundColor: 'white',
                      borderRight: '1px solid #f3f4f6',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        borderBottom: '2px solid #0055A4',
                        paddingBottom: '8px',
                        marginRight: '24px',
                        marginBottom: '8px',
                      }}
                    >
                      <h3 style={{ fontWeight: 700, fontSize: '16px', color: '#111827' }}>
                        {megaMenuData[activeMenu]?.title}
                      </h3>
                      <a
                        href={megaMenuData[activeMenu]?.link}
                        style={{ fontSize: '11px', color: '#6b7280' }}
                      >
                        모두 보기
                      </a>
                    </div>
                    <div style={{ overflowY: 'auto', paddingRight: '16px' }}>
                      {megaMenuData[activeMenu]?.items?.map((item, idx) => (
                        <a
                          key={item}
                          href={
                            megaMenuData[item]?.link ||
                            megaMenuData[activeMenu as string]?.link ||
                            '#'
                          }
                          onClick={() => track({ ev: 'click_category', meta: { category: item } })}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 16px',
                            borderBottom: '1px solid #f3f4f6',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: idx === 0 ? '#111827' : '#6b7280',
                            backgroundColor: idx === 0 ? '#f3f4f6' : 'transparent',
                            fontWeight: idx === 0 ? 700 : 400,
                            textDecoration: 'none',
                          }}
                        >
                          <span>{item}</span>
                          <span style={{ color: '#9ca3af' }}>›</span>
                        </a>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      width: '25%',
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '24px 24px 24px 16px',
                      backgroundColor: 'white',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        borderBottom: '2px solid #0055A4',
                        paddingBottom: '8px',
                        marginBottom: '8px',
                      }}
                    >
                      <h3 style={{ fontWeight: 700, fontSize: '16px', color: '#111827' }}>러닝</h3>
                      <a href="/category/running" style={{ fontSize: '11px', color: '#6b7280' }}>
                        모두 보기
                      </a>
                    </div>
                    <div style={{ overflowY: 'auto' }}>
                      {[
                        '신제품',
                        '베스트셀러',
                        '러닝화',
                        '남성',
                        '여성',
                        '용품',
                        '트레일러닝',
                        '러닝 클리어런스',
                        '러닝웨어',
                      ].map((subItem) => (
                        <a
                          key={subItem}
                          href="/category/running"
                          onClick={() =>
                            track({ ev: 'click_category', meta: { category: subItem } })
                          }
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 8px',
                            borderBottom: '1px solid #f3f4f6',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: '#374151',
                            textDecoration: 'none',
                          }}
                        >
                          <span>{subItem}</span>
                          <span style={{ color: '#9ca3af' }}>›</span>
                        </a>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      width: '50%',
                      padding: '24px',
                      backgroundColor: '#ffffff',
                      display: 'flex',
                      gap: '16px',
                    }}
                  >
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <img
                        src="https://contents.mediadecathlon.com/p2861117/k$f230ceac9888cc19f9b50093d1d0d77d/1200x800/QUECHUA.jpg?format=auto"
                        alt="promo1"
                        style={{ flex: 1, width: '100%', objectFit: 'cover', borderRadius: '4px' }}
                      />
                      <img
                        src="https://contents.mediadecathlon.com/p3048178/k$8983f233e80f2bcbd10ca3793459d355/2200x1103/5000pt3791/10000xcr5017/KIPRUN.webp"
                        alt="promo2"
                        style={{ flex: 1, width: '100%', objectFit: 'cover', borderRadius: '4px' }}
                      />
                    </div>
                    <div
                      style={{
                        flex: 1,
                        backgroundColor: '#3A4EB5',
                        borderRadius: '4px',
                        padding: '24px',
                        color: 'white',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                      }}
                    >
                      <h4 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
                        데카트론 APP에서
                        <br />
                        편리한 쇼핑
                      </h4>
                      <img
                        src="https://contents.mediadecathlon.com/s1012444/k$f9cd9f79c6b583f1c842884359c0843e/app%20store%20button%20tr.svg"
                        alt="app"
                        style={{ width: '120px', marginTop: 'auto' }}
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* --- 2-COLUMN LAYOUT --- */
                <>
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
                        borderBottom: '2px solid #0055A4',
                        paddingBottom: '8px',
                        marginBottom: '16px',
                      }}
                    >
                      <h3 style={{ fontWeight: 700, fontSize: '18px', color: '#111827' }}>
                        {megaMenuData[activeMenu as string]?.title}
                      </h3>
                      <a
                        href={megaMenuData[activeMenu as string]?.link}
                        style={{ fontSize: '12px', color: '#6b7280', textDecoration: 'none' }}
                      >
                        모두 보기
                      </a>
                    </div>
                    <div style={{ overflowY: 'auto', paddingRight: '16px' }}>
                      {megaMenuData[activeMenu as string]?.items?.map((item) => (
                        <a
                          key={item}
                          href={megaMenuData[activeMenu as string]?.link || '#'}
                          onClick={() => track({ ev: 'click_category', meta: { category: item } })}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '14px 0',
                            borderBottom: '1px solid #f3f4f6',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: '#374151',
                            textDecoration: 'none', // Keeps it from looking like a standard blue link
                          }}
                        >
                          <span>{item}</span>
                          <span style={{ color: '#9ca3af' }}>›</span>
                        </a>
                      ))}
                    </div>
                  </div>
                  <div style={{ width: '70%', position: 'relative', backgroundColor: '#f3f4f6' }}>
                    <img
                      src={megaMenuData[activeMenu as string]?.image}
                      alt={`${activeMenu} Promo`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                </>
              )}

              <button
                onClick={() => setActiveMenu(null)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  color: '#111827',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '16px',
                  border: 'none',
                  cursor: 'pointer',
                  zIndex: 10,
                }}
              >
                ✕
              </button>
            </div>
          </>
        )}
      </nav>

      {/* Mobile Side Drawer (Slides out when Hamburger is clicked) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] flex md:hidden">
          {/* Dark Overlay */}
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setIsMobileMenuOpen(false)}
          ></div>
          {/* White Drawer */}
          <div className="relative w-[85%] max-w-sm bg-white h-full shadow-xl flex flex-col z-[101] overflow-y-auto">
            <div className="p-4 flex justify-between items-center bg-[#0055A4] text-white">
              <span className="font-bold text-lg">전체 카테고리</span>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-2xl leading-none bg-transparent border-none text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col">
              {navCategories.map((cat) => (
                <a
                  key={cat.label}
                  href={cat.href}
                  className="px-6 py-4 border-b border-gray-100 text-sm font-medium text-gray-800 flex justify-between items-center no-underline"
                >
                  <span style={{ color: cat.color || '#111827' }}>{cat.label}</span>
                  <span className="text-gray-400">›</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
