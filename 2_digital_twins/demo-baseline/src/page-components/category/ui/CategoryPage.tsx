'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

// Filter Data Maps
const FILTER_GENDERS = ['남성용', '여성용', '공용', '남아용', '여아용'];
const FILTER_COLORS = ['블랙', '화이트', '블루', '레드', '그레이', '핑크'];
const FILTER_TYPES = ['반바지', '반소매 티셔츠', '긴소매 티셔츠', '자켓', '양말', '배낭 / 백팩'];
const FILTER_SIZES = ['S', 'M', 'L', 'XL', '2XL', 'Free'];

export function CategoryPage({ categorySlug }: { categorySlug: string }) {
  const router = useRouter();
  const categoryName = categoryNames[categorySlug] || categorySlug;

  // State Management for ALL complex filters
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);

  const [sortOrder, setSortOrder] = useState<string>('추천순');

  useEffect(() => {
    setSelectedCategories(categoryName !== 'FIRST CHOICE' ? [categoryName] : []);
  }, [categoryName]);

  // Generic Toggle Handler
  const toggleFilter = (setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    setter((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  };

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedGenders([]);
    setSelectedColors([]);
    setSelectedTypes([]);
    setSelectedSizes([]);
  };

  const filteredProducts = useMemo(() => {
    let result = runningProducts.filter((product) => {
      const matchesCat =
        selectedCategories.length === 0 || selectedCategories.includes(product.category);
      const matchesGender =
        selectedGenders.length === 0 ||
        (product.gender && selectedGenders.includes(product.gender));
      const matchesColor =
        selectedColors.length === 0 ||
        (product.colors && product.colors.some((c) => selectedColors.includes(c)));
      const matchesType =
        selectedTypes.length === 0 ||
        (product.productType && selectedTypes.includes(product.productType));
      const matchesSize =
        selectedSizes.length === 0 ||
        (product.sizes && product.sizes.some((s) => selectedSizes.includes(s)));

      return matchesCat && matchesGender && matchesColor && matchesType && matchesSize;
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
  }, [
    selectedCategories,
    selectedGenders,
    selectedColors,
    selectedTypes,
    selectedSizes,
    sortOrder,
  ]);

  // Helper function to calculate real-time counts for the sidebar!
  const getFilterCount = (field: 'gender' | 'colors' | 'productType' | 'sizes', value: string) => {
    return runningProducts.filter((p) => {
      if (!p[field]) return false;
      if (Array.isArray(p[field])) return (p[field] as string[]).includes(value);
      return p[field] === value;
    }).length;
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Header />
      <main>
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-[1200px] mx-auto px-4 py-6 flex flex-col justify-center">
            <div className="text-sm text-gray-500 mb-3 flex items-center gap-2">
              <a href="/" className="hover:underline">
                홈 (HOME)
              </a>
              <span>{'>'}</span>
              <span className="font-bold text-gray-900">{categoryName}</span>
            </div>
            <h1 className="text-2xl font-black italic uppercase text-gray-900 mb-1">
              {categoryName}
            </h1>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto px-4 py-6 flex gap-8 items-start">
          {/* LEFT SIDEBAR: Interactive Filters */}
          <aside className="hidden lg:block w-1/4 flex-shrink-0 sticky top-[120px]  max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
            <div className="text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-black flex justify-between">
              <span>필터</span>
              <button
                onClick={clearAllFilters}
                className="text-xs text-blue-600 font-normal hover:underline"
              >
                초기화
              </button>
            </div>

            {/* Brand Filter */}
            <div className="border-b border-gray-200 py-4">
              <h3 className="text-sm font-bold text-gray-800 mb-3">필터 기준 성별</h3>
              <div className="flex flex-col gap-2">
                {FILTER_GENDERS.map((gender) => {
                  const count = getFilterCount('gender', gender);
                  if (count === 0) return null; // Hide empty filters
                  return (
                    <label
                      key={gender}
                      className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-1 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-blue-600 rounded"
                          checked={selectedGenders.includes(gender)}
                          onChange={() => toggleFilter(setSelectedGenders, gender)}
                        />
                        <span className="text-sm text-gray-700">{gender}</span>
                      </div>
                      <span className="text-xs text-gray-400">({count})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Product Type Filter */}
            <div className="border-b border-gray-200 py-4">
              <h3 className="text-sm font-bold text-gray-800 mb-3">필터 기준 카테고리</h3>
              <div className="flex flex-col gap-2">
                {FILTER_TYPES.map((type) => {
                  const count = getFilterCount('productType', type);
                  if (count === 0) return null;
                  return (
                    <label
                      key={type}
                      className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-1 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-blue-600 rounded"
                          checked={selectedTypes.includes(type)}
                          onChange={() => toggleFilter(setSelectedTypes, type)}
                        />
                        <span className="text-sm text-gray-700">{type}</span>
                      </div>
                      <span className="text-xs text-gray-400">({count})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Size Filter */}
            <div className="border-b border-gray-200 py-4">
              <h3 className="text-sm font-bold text-gray-800 mb-3">필터 기준 사이즈</h3>
              <div className="flex flex-col gap-2">
                {FILTER_SIZES.map((size) => {
                  const count = getFilterCount('sizes', size);
                  if (count === 0) return null;
                  return (
                    <label
                      key={size}
                      className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-1 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-blue-600 rounded"
                          checked={selectedSizes.includes(size)}
                          onChange={() => toggleFilter(setSelectedSizes, size)}
                        />
                        <span className="text-sm text-gray-700">{size}</span>
                      </div>
                      <span className="text-xs text-gray-400">({count})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Color Filter */}
            <div className="border-b border-gray-200 py-4">
              <h3 className="text-sm font-bold text-gray-800 mb-3">필터 기준 색상</h3>
              <div className="flex flex-col gap-2">
                {FILTER_COLORS.map((color) => {
                  const count = getFilterCount('colors', color);
                  if (count === 0) return null;
                  return (
                    <label
                      key={color}
                      className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-1 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-blue-600 rounded"
                          checked={selectedColors.includes(color)}
                          onChange={() => toggleFilter(setSelectedColors, color)}
                        />
                        <span className="text-sm text-gray-700">{color}</span>
                      </div>
                      <span className="text-xs text-gray-400">({count})</span>
                    </label>
                  );
                })}
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
                {filteredProducts.map((product: any) => {
                  // Adapter: Forces mock data to perfectly match what ProductCard expects!
                  const safeProduct = {
                    ...product,
                    imageUrl: product.imageUrl || product.img || product.image, // Fixes broken images
                    name: product.name || product.title, // Fixes missing names
                  };

                  return (
                    <div key={product.id} className="h-full">
                      <ProductCard product={safeProduct} />
                    </div>
                  );
                })}
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
