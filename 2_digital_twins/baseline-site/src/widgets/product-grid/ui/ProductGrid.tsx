import { ProductCard } from "@/entities/product";
import type { Product } from "@/entities/product";

type ProductGridProps = {
  title: string;
  products: Product[];
};

export function ProductGrid({ title, products }: ProductGridProps) {
  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900">{title}</h2>
        
          href="/products"
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          전체보기 →
        </a>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}