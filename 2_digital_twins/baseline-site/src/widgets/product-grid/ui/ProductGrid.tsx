import { ProductCard } from "@/entities/product/ui/ProductCard";
import type { Product } from "@/entities/product/model/types";

type ProductGridProps = {
  title: string;
  products: Product[];
};

export function ProductGrid({ title, products }: ProductGridProps) {
  return (
    <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: "16px",
      }}>
        <h2 style={{ fontSize: "20px", fontWeight: 900, color: "#111827" }}>
          {title}
        </h2>
        <a href="/products" style={{ fontSize: "13px", color: "#0082C3", textDecoration: "none" }}>
          전체보기
        </a>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "16px",
      }}>
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}