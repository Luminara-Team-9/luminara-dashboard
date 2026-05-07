"use client";

import { useState, useMemo } from 'react';
import { Header } from '@/widgets/header';
import { Footer } from '@/widgets/footer';
import { ProductCard } from '@/entities/product/ui/ProductCard';
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

const AVAILABLE_BRANDS = ['KIPRUN', 'KALENJI', 'DECATHLON', 'QUECHUA', 'SIMOND'];
const AVAILABLE_CATEGORIES = ['러닝', '등산'];

export function CategoryPage({ categorySlug }: { categorySlug: string }) {
  const categoryName = categoryNames[categorySlug] || categorySlug;

  // 1. Dynamic State for Filters
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const [sortOrder, setSortOrder] = useState<string>('추천순');

  // 2. Toggle Handlers
  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev => 
      prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
    );
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  // 3. Real-time Filtering Engine
  const filteredProducts = useMemo(() => {
    let result = runningProducts.filter(product => {

      // Check if product matches selected brands (brand is often in the product name)
      const matchesBrand = selectedBrands.length === 0 || selectedBrands.some(brand => product.name.includes(brand));
      
      // Check if product matches selected categories
      const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(product.category);

      return matchesBrand && matchesCategory;
    });

    // Step B: Sort
    if (sortOrder === '낮은 가격순') {
      result.sort((a, b) => a.price - b.price);
    } else if (sortOrder === '높은 가격순') {
      result.sort((a, b) => b.price - a.price);
    } else if (sortOrder === '추천순') {
      // Sort by rating (highest first), fallback to 0 if no rating exists
      result.sort((a, b) => (b.rating || 0) - (a.rating || 0)); 
    }

    return result;
  }, [selectedBrands, selectedCategories, sortOrder]);

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
          {/* LEFT SIDEBAR: Interactive Filters */}
          <aside className="hidden lg:block w-1/4 flex-shrink-0 sticky top-[120px]">
            <div className="text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-black flex justify-between">
              <span>필터</span>
              {(selectedBrands.length > 0 || selectedCategories.length > 0) && (
                <button 
                  onClick={() => { setSelectedBrands([]); setSelectedCategories([]); }}
                  className="text-xs text-blue-600 font-normal hover:underline"
                >
                  초기화
                </button>
              )}
            </div>

            {/* Brand Filter */}
            <div className="border-b border-gray-200 py-4">
              <h3 className="text-sm font-bold text-gray-800 mb-3">브랜드</h3>
              <div className="flex flex-col gap-2">
                {AVAILABLE_BRANDS.map(brand => (
                  <label key={brand} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-blue-600 rounded border-gray-300"
                      checked={selectedBrands.includes(brand)}
                      onChange={() => toggleBrand(brand)}
                    />
                    <span className="text-sm text-gray-700">{brand}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Category Filter */}
            <div className="border-b border-gray-200 py-4">
              <h3 className="text-sm font-bold text-gray-800 mb-3">스포츠 카테고리</h3>
              <div className="flex flex-col gap-2">
                {AVAILABLE_CATEGORIES.map(category => (
                  <label key={category} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-blue-600 rounded border-gray-300"
                      checked={selectedCategories.includes(category)}
                      onChange={() => toggleCategory(category)}
                    />
                    <span className="text-sm text-gray-700">{category}</span>
                  </label>
                ))}
              </div>
            </div>
          </aside>

          {/* RIGHT SIDE: Product Grid */}
          <div className="w-full lg:w-3/4">
            {/* Top Bar: Item Count & Sort */}
            <div className="flex justify-between items-center pb-4 mb-6 border-b border-gray-200">
              <span className="text-sm font-bold text-blue-600">
                총 {filteredProducts.length}개 상품
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 hidden md:inline">정렬기준</span>
                <select 
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="text-sm font-bold text-gray-800 outline-none cursor-pointer bg-transparent border-none"
                >
                  <option value="추천순">추천순</option>
                  <option value="낮은 가격순">낮은 가격순</option>
                  <option value="높은 가격순">높은 가격순</option>
                </select>
              </div>
            </div>

            {/* Empty State */}
            {filteredProducts.length === 0 ? (
              <div className="py-20 text-center text-gray-500">
                선택한 필터 조건에 맞는 상품이 없습니다.
              </div>
            ) : (
              /* Filtered Grid */
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.map((product) => (
                  <a key={product.id} href={`/product/${product.id}`} style={{ textDecoration: 'none' }}>
                    <ProductCard product={product} />
                  </a>
                ))}
              </div>
            )}

            {/* Load More Section (Updated to use dynamic counts) */}
            {filteredProducts.length > 0 && (
              <div className="flex flex-col items-center justify-center mt-16 mb-8">
                <p className="text-xs text-gray-500 mb-3 font-semibold">
                  {filteredProducts.length}개의 제품 중 {filteredProducts.length}개를 보여줍니다.
                </p>
                <div className="w-48 h-1 bg-gray-200 mb-6 overflow-hidden">
                  <div className="w-full h-full bg-blue-600"></div>
                </div>
                <button className="border border-gray-300 rounded-full px-8 py-2.5 text-sm font-bold text-gray-800 hover:bg-gray-50 transition flex items-center gap-2">
                  더보기
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
