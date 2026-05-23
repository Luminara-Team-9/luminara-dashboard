'use client';

import { useState, useEffect } from 'react';
import type { Product } from '../model/types';
import Link from 'next/link';

type ProductCardProps = {
  product: Product;
  index?: number;
};

export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);

  useEffect(() => {
    // 1. The Staggered Fade-In (UI Realism)
    const fadeTimer = setTimeout(() => setIsVisible(true), index * 150);

    // 2. The Micro-Shift (The CLS Sabotage - 1.2s delay)
    const shiftTimer = setTimeout(() => setReviewsLoaded(true), 1200);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(shiftTimer);
    };
  }, [index]);

  const colors = ['bg-black', 'bg-[#0055A4]', 'bg-gray-400']; // For the color picker
  const sizes = ['S', 'M', 'L', 'XL'];

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedSize) {
      setShowError(true);
      setTimeout(() => setShowError(false), 2000);
      return;
    }

    // --- NEW: Save to Local Storage ---
    const existingCart = JSON.parse(localStorage.getItem('decathlon_cart') || '[]');

    const cartItem = {
      id: product.id || String(Math.random()),
      name: product.name,
      brand: product.category || 'DECATHLON',
      price: product.price,
      originalPrice: product.originalPrice,
      size: selectedSize,
      quantity: quantity,
      imageUrl: product.imageUrl,
    };

    const existingItemIndex = existingCart.findIndex(
      (item: any) => item.id === cartItem.id && item.size === cartItem.size,
    );

    if (existingItemIndex > -1) {
      existingCart[existingItemIndex].quantity += quantity;
    } else {
      existingCart.push(cartItem);
    }

    localStorage.setItem('decathlon_cart', JSON.stringify(existingCart));
    // ----------------------------------

    setShowError(false);
    setShowSuccess(true);
    window.dispatchEvent(new CustomEvent('cart-updated'));
  };

  const discount = product.originalPrice
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : null;

  return (
    <div
      className={`transition-all duration-700 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        overflow: 'hidden',
        cursor: 'pointer',
        flexShrink: 0,
        width: '200px',
        position: 'relative',
      }}
    >
      {/* Image */}
      <div style={{ position: 'relative', backgroundColor: '#636d77' }}>
        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        {product.badge && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              backgroundColor:
                product.badge === 'sale'
                  ? '#ef4444'
                  : product.badge === 'new'
                    ? '#22c55e'
                    : '#f97316',
              color: 'white',
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '4px',
            }}
          >
            {product.badge === 'sale' ? 'Sale' : product.badge === 'new' ? 'NEW' : 'BEST'}
          </div>
        )}
      </div>
      {/* Info - Price FIRST then name like real site */}
      <div style={{ padding: '12px' }}>
        {/* Price section - ABOVE name */}
        <div style={{ marginBottom: '6px' }}>
          {product.originalPrice && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
              <span style={{ fontSize: '11px', color: '#9ca3af', textDecoration: 'line-through' }}>
                {product.originalPrice.toLocaleString()}원
              </span>
              {discount && (
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444' }}>
                  -{discount}%
                </span>
              )}
            </div>
          )}
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>
            {product.price.toLocaleString()}원
          </span>
        </div>
        {/* Name - BELOW price */}
        <p
          style={{
            fontSize: '13px',
            fontWeight: 400,
            color: '#374151',
            lineHeight: '1.4',
            marginBottom: '6px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: '36px',
          }}
        >
          {product.name}
        </p>
        {/* --- NEW: THE CLS MICRO-SHIFT WEAPON --- */}
        <div
          style={{
            height: reviewsLoaded ? '20px' : '0px',
            overflow: 'hidden',
            transition: 'none',
            display: 'flex',
            alignItems: 'center',
            color: '#fbbf24',
            fontSize: '11px',
            marginBottom: reviewsLoaded ? '4px' : '0px',
          }}
        >
          ⭐⭐⭐ <span style={{ color: '#9ca3af', marginLeft: '4px' }}>(4.8)</span>
        </div>

        {/* Brand */}
        <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>
          {product.category}
        </p>
        {/* Rating + Cart button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {product.rating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: '#fbbf24', fontSize: '12px' }}>★</span>
              <span style={{ fontSize: '12px', color: '#374151' }}>{product.rating}</span>
            </div>
          )}
          {/* Updated Cart Button */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsQuickAddOpen(true);
            }}
            className="w-8 h-8 rounded-full bg-[#f3f4f6] text-gray-600 hover:bg-[#0055A4] hover:text-white transition-colors flex items-center justify-center ml-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </button>
        </div>
      </div>
      {/* --- NEW: RIGHT-SIDE DRAWER WITH NATURAL ANIMATION --- */}
      <div
        className={`fixed inset-0 z-[100] flex justify-end transition-opacity duration-300 ${isQuickAddOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ top: 0, left: 0, right: 0, bottom: 0 }}
      >
        <div
          className="absolute inset-0 bg-black/40"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsQuickAddOpen(false);
            setTimeout(() => setShowSuccess(false), 300);
          }}
        />

        <div
          className={`relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col z-10 transform transition-transform duration-300 ease-out ${isQuickAddOpen ? 'translate-x-0' : 'translate-x-full'}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {showSuccess ? (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="flex justify-between items-center p-4 border-b border-gray-100">
                <h2 className="text-lg font-black text-gray-900">장바구니 담기 완료!</h2>
                <button
                  onClick={() => {
                    setIsQuickAddOpen(false);
                    setTimeout(() => setShowSuccess(false), 300);
                  }}
                  className="text-xl"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 bg-gray-50 flex gap-4 items-center">
                <img
                  src={product.imageUrl}
                  alt="product"
                  className="w-16 h-16 object-cover bg-white border border-gray-200"
                />
                <div>
                  {/* Fixed variable: product.name */}
                  <p className="text-sm text-gray-800">{product.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    사이즈: {selectedSize} | 수량: {quantity}개
                  </p>
                  <p className="text-xs font-bold text-green-600 mt-1 flex items-center gap-1">
                    <span className="text-sm">✔</span> 장바구니 추가 완료
                  </p>
                </div>
              </div>
              <div className="mt-auto p-4 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setIsQuickAddOpen(false);
                    setTimeout(() => setShowSuccess(false), 300);
                  }}
                  className="w-full py-3 bg-white border border-gray-300 text-gray-800 font-bold text-sm hover:bg-gray-50 transition-colors"
                >
                  계속 쇼핑하기
                </button>
                <Link
                  href="/cart"
                  className="w-full py-3 bg-[#3a4eb5] hover:bg-blue-800 text-white text-center font-bold text-sm transition-colors"
                >
                  장바구니로 이동
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full overflow-y-auto">
              {/* Error Toast Message */}
              <div
                className={`absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-bold px-4 py-2 rounded shadow-lg transition-opacity duration-300 z-50 ${showError ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              >
                옵션을 선택해주세요 (No item added)
              </div>

              <div className="flex items-center gap-3 p-4 border-b border-gray-100 text-[#3a4eb5]">
                <button onClick={() => setIsQuickAddOpen(false)} className="text-lg font-bold">
                  〈
                </button>
                <h2 className="text-sm font-bold">장바구니 수정하기</h2>
              </div>

              <div className="p-4 flex gap-4">
                <img src={product.imageUrl} alt="product" className="w-20 h-24 object-cover" />
                <div>
                  <p className="text-lg font-bold text-gray-900">
                    {product.price.toLocaleString()}원
                  </p>
                  {/* Fixed variable: product.category */}
                  <p className="text-xs font-bold text-gray-500 mt-1">{product.category}</p>
                  <p className="text-sm text-gray-800 leading-snug">{product.name}</p>
                </div>
              </div>

              <div className="px-4 py-2 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-800 mb-2">색상</p>
                <div className="flex gap-2">
                  {colors.map((color, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedColor(idx)}
                      className={`w-10 h-12 rounded-sm ${color} ${selectedColor === idx ? 'ring-2 ring-offset-2 ring-[#3a4eb5]' : 'border border-gray-200'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="px-4 py-4 mt-2">
                <div className="flex justify-between items-end mb-2">
                  <p className="text-xs font-bold text-gray-800">
                    사이즈 <span className="text-red-500">*</span>
                  </p>
                  <span className="text-xs text-[#3a4eb5] underline cursor-pointer">
                    내 사이즈 찾기
                  </span>
                </div>
                <select
                  value={selectedSize}
                  onChange={(e) => {
                    setSelectedSize(e.target.value);
                    setShowError(false);
                  }}
                  className={`w-full border rounded p-3 text-sm text-gray-700 outline-none transition-colors ${showError ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-[#3a4eb5]'}`}
                >
                  <option value="" disabled>
                    사이즈를 선택하세요 (필수)
                  </option>
                  {sizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>

              <div className="px-4 py-2">
                <p className="text-xs font-bold text-gray-800 mb-2">수량</p>
                <div className="flex items-center border border-gray-300 w-fit rounded">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-4 py-2 text-gray-400 hover:text-[#3a4eb5] text-lg leading-none"
                  >
                    -
                  </button>
                  <span className="text-sm font-bold w-8 text-center">{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="px-4 py-2 text-[#3a4eb5] text-lg leading-none"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="mt-auto p-4 border-t border-gray-100 bg-white sticky bottom-0">
                <button
                  onClick={handleAddToCart}
                  className="w-full py-4 bg-[#3a4eb5] hover:bg-blue-800 text-white font-bold text-sm rounded-sm transition-colors flex justify-center items-center"
                >
                  장바구니 담기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
