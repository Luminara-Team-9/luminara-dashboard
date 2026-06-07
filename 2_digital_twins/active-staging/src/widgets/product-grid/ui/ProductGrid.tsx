import { ProductCard } from '@/entities/product/ui/ProductCard';
import type { Product } from '@/entities/product/model/types';
import React from 'react';

type ProductGridProps = {
  title: string;
  products: Product[];
  promoCard?: {
    insertAt: number; // The index where the banner should appear
    content: React.ReactNode; // The banner component itself
  };
};

export function ProductGrid({ title, products, promoCard }: ProductGridProps) {
  return (
    <section style={{ backgroundColor: 'white', padding: '24px 0', marginBottom: '8px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#111827' }}>{title}</h2>
          <a
            href="/products"
            style={{ fontSize: '13px', color: '#6b7280', textDecoration: 'none' }}
          >
            전체보기
          </a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" style={{ aspectRatio: '1 / 1.5' }}>
          {products.map((product, index) => {
            const isPromoSpot = promoCard && index === promoCard.insertAt;

            return (
              <React.Fragment key={product.id}>
                {/* INJECT BANNER FIRST if we hit the target slot */}
                {isPromoSpot && promoCard.content}

                {/* Render the normal Product Card */}
                <a href={`/product/${product.id}`} style={{ textDecoration: 'none' }}>
                  <ProductCard key={product.id} product={product} index={index} />;
                </a>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}
