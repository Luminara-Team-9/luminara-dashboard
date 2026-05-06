import { ProductCard } from "@/entities/product/ui/ProductCard";
import type { Product } from "@/entities/product/model/types";

type ProductGridProps = {
  title: string;
  products: Product[];
};

export function ProductGrid({ title, products }: ProductGridProps) {
  return (
    <section style={{ backgroundColor: "white", padding: "24px 0", marginBottom: "8px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 16px" }}>
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between", marginBottom: "16px",
        }}>
          <h2 style={{ fontSize: "22px", fontWeight: 900, color: "#111827" }}>
            {title}
          </h2>
          <a href="/products" style={{ fontSize: "13px", color: "#6b7280", textDecoration: "none" }}>
            전체보기
          </a>
        </div>
        {/* Horizontally scrollable row - matches real site */}
        <div style={{
          display: "flex",
          gap: "12px",
          overflowX: "auto",
          paddingBottom: "8px",
          scrollbarWidth: "none",
        }}>
          {products.map((product) => (
            <a
              key={product.id}
              href={`/product/${product.id}`}
              style={{ textDecoration: "none", flexShrink: 0 }}
            >
              <ProductCard product={product} />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
