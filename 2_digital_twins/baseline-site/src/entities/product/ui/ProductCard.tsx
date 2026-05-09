import Image from 'next/image';
import type { Product } from '../model/types';
import { formatPrice } from '@/shared/lib';

type ProductCardProps = {
  product: Product;
};

const badgeStyles = {
  new: 'bg-green-500',
  sale: 'bg-red-500',
  best: 'bg-orange-500',
};

export function ProductCard({ product }: ProductCardProps) {
  const discount = product.originalPrice
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : null;

  return (
    <div className="group bg-white rounded-lg overflow-hidden border border-gray-100 hover:shadow-md transition-shadow duration-200 cursor-pointer">
      {/* Image Container */}
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {product.badge && (
          <span
            className={`absolute top-2 left-2 ${badgeStyles[product.badge]} text-white text-xs font-bold px-2 py-1 rounded`}
          >
            {product.badge.toUpperCase()}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide">{product.category}</p>
        <h3 className="text-sm font-medium text-gray-800 line-clamp-2 mb-2 leading-snug">
          {product.name}
        </h3>

        {/* Price */}
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-gray-900">{formatPrice(product.price)}</span>
          {product.originalPrice && (
            <>
              <span className="text-xs text-gray-400 line-through">
                {formatPrice(product.originalPrice)}
              </span>
              <span className="text-xs font-bold text-red-500">-{discount}%</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
