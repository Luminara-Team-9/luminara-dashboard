import { Header } from '@/widgets/header';
import { Footer } from '@/widgets/footer';
import { ProductCard } from '@/entities/product/ui/ProductCard';

import type { Product } from '@/entities/product/model/types';

import { runningProducts } from '@/page-components/main-landing/ui/mockData';

const categoryNames: Record<string, string> = {
  'first-choice': 'FIRST CHOICE',
  running: '러닝',
  hiking: '등산',
  fitness: '필라테스/피트니스',
  camping: '캠핑',
  swimming: '수영/스노클링',
  cycling: '자전거',
  football: '축구',
};

export function CategoryPage({ categorySlug }: { categorySlug: string }) {
  const categoryName = categoryNames[categorySlug] || categorySlug;
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Header />
      <main>
        <div style={{ backgroundColor: 'white', borderBottom: '1px solid #e5e7eb' }}>
          <div
            style={{
              maxWidth: '1200px',
              margin: '0 auto',
              padding: '12px 16px',
              display: 'flex',
              gap: '8px',
              fontSize: '13px',
              color: '#6b7280',
            }}
          >
            <a href="/" style={{ color: '#6b7280', textDecoration: 'none' }}>
              홈
            </a>
            <span>{'>'}</span>
            <span style={{ color: '#111827', fontWeight: 500 }}>{categoryName}</span>
          </div>
        </div>

        <div className="bg-white border-b border-gray-200">
          <div className="max-w-[1200px] mx-auto px-4 py-6 flex items-start gap-4">
            {categorySlug === 'first-choice' && (
              <div className="w-16 h-16 bg-gray-100 flex-shrink-0">
                <img
                  src="https://contents.mediadecathlon.com/p3115871/sq/k$53ff826588e9362fc5dbc161f2cf08cc/%EC%97%AC%EC%84%B1-%EC%B9%B4%EB%B3%B8-%EB%A0%88%EC%9D%B4%EC%8B%B1%ED%99%94-%ED%82%B5%EC%8A%A4%ED%86%B0-%EC%B1%8C%EB%A6%B0%EC%A0%80-kiprun-8967622.jpg?f=200x200&format=auto"
                  alt="Category icon"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex flex-col justify-center">
              <h1 className="text-2xl font-black italic uppercase text-gray-900 mb-1">
                {categorySlug === 'first-choice' ? 'FIRST CHOICE' : categoryName}
              </h1>
              <p className="text-xs text-gray-500">
                {categorySlug === 'first-choice'
                  ? '첫 구매라면? 이 제품부터 시작하세요.'
                  : '데카트론 추천 상품을 만나보세요.'}
              </p>
            </div>
          </div>
        </div>
        {/* Main Content Layout (Sidebar + Grid) */}
        <div className="max-w-[1200px] mx-auto px-4 py-6 flex gap-8 items-start">
          {/* LEFT SIDEBAR: Filters (Hidden on mobile, visible on desktop) */}
          <aside className="hidden lg:block w-1/4 flex-shrink-0 sticky top-4">
            <div className="text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-black">
              필터
            </div>

            {/* Filter Sections */}
            {[
              '필터 기준 브랜드',
              '필터 기준 색상',
              '필터 기준 성별',
              '필터 기준 가격',
              '필터 기준 제품 특성',
              '필터 기준 사이즈',
            ].map((filterTitle, index) => (
              <div
                key={index}
                className="border-b border-gray-200 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <button className="w-full flex justify-between items-center text-sm font-bold text-gray-800">
                  {filterTitle}
                  <span className="text-lg font-light">+</span>
                </button>
              </div>
            ))}
          </aside>

          {/* RIGHT SIDE: Top Bar + Product Grid */}
          <div className="w-full lg:w-3/4">
            {/* Top Bar: Item Count & Sort */}
            <div className="flex justify-between items-center pb-4 mb-6 border-b border-gray-200">
              <span className="text-sm font-bold text-blue-600">
                총 {runningProducts.length}개 상품
              </span>

              <div className="flex items-center gap-4">
                {/* Mobile Filter Button (Only shows on phones) */}
                <button className="lg:hidden flex items-center gap-1.5 text-sm font-bold text-gray-800">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-4 h-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
                    />
                  </svg>
                  필터
                </button>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 hidden md:inline">정렬기준</span>
                  <select className="text-sm font-bold text-gray-800 outline-none cursor-pointer bg-transparent border-none">
                    <option>추천순</option>
                    <option>낮은 가격순</option>
                    <option>높은 가격순</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Product Grid (Responsive: 2 on mobile, 3 on tablet, 4 on desktop) */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {runningProducts.map((product) => (
                <a
                  key={product.id}
                  href={`/product/${product.id}`}
                  style={{ textDecoration: 'none' }}
                >
                  <ProductCard product={product} />
                </a>
              ))}
            </div>

            {/* Load More Section */}
            <div className="flex flex-col items-center justify-center mt-16 mb-8">
              <p className="text-xs text-gray-500 mb-3 font-semibold">
                {runningProducts.length}개의 제품 중 {runningProducts.length}개를 보여줍니다.
              </p>
              <div className="w-48 h-1 bg-gray-200 mb-6 overflow-hidden">
                <div className="w-full h-full bg-blue-600"></div>
              </div>
              <button className="border border-gray-300 rounded-full px-8 py-2.5 text-sm font-bold text-gray-800 hover:bg-gray-50 transition flex items-center gap-2">
                더보기
              </button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
