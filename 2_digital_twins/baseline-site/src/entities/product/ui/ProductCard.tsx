import type { Product } from "../model/types";

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  const discount = product.originalPrice
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : null;

  return (
    <div style={{
      backgroundColor: "white", borderRadius: "8px", overflow: "hidden",
      border: "1px solid #e5e7eb", cursor: "pointer",
    }}>
      <div style={{ position: "relative", backgroundColor: "#f9fafb" }}>
        <img
          src={product.imageUrl}
          alt={product.name}
          width={400}
          height={400}
          style={{ width: "100%", height: "200px", objectFit: "cover", display: "block" }}
        />
        {product.badge && (
          <div style={{
            position: "absolute", top: "8px", left: "8px",
            backgroundColor: product.badge === "sale" ? "#ef4444" : product.badge === "new" ? "#22c55e" : "#f97316",
            color: "white", fontSize: "10px", fontWeight: 700,
            padding: "2px 6px", borderRadius: "4px",
          }}>
            {product.badge.toUpperCase()}
          </div>
        )}
      </div>
      <div style={{ padding: "12px" }}>
        <p style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px", textTransform: "uppercase" }}>
          {product.category}
        </p>
        <h3 style={{
          fontSize: "13px", fontWeight: 500, color: "#111827",
          marginBottom: "8px", lineHeight: "1.4",
          display: "-webkit-box", WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {product.name}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "15px", fontWeight: 700, color: "#111827" }}>
            {product.price.toLocaleString("ko-KR")}원
          </span>
          {product.originalPrice && (
            <span style={{ fontSize: "12px", color: "#9ca3af", textDecoration: "line-through" }}>
              {product.originalPrice.toLocaleString("ko-KR")}원
            </span>
          )}
          {discount && (
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#ef4444" }}>
              -{discount}%
            </span>
          )}
        </div>
        {product.rating && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "6px" }}>
            <span style={{ color: "#fbbf24", fontSize: "12px" }}>★</span>
            <span style={{ fontSize: "12px", color: "#6b7280" }}>{product.rating}</span>
          </div>
        )}
      </div>
    </div>
  );
}