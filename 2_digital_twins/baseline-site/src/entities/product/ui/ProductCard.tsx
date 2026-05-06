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
      backgroundColor: "white",
      borderRadius: "8px",
      overflow: "hidden",
      cursor: "pointer",
      flexShrink: 0,
      width: "200px",
    }}>
      {/* Image */}
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
            backgroundColor: product.badge === "sale" ? "#ef4444"
              : product.badge === "new" ? "#22c55e" : "#f97316",
            color: "white", fontSize: "10px", fontWeight: 700,
            padding: "2px 8px", borderRadius: "4px",
          }}>
            {product.badge === "sale" ? "Sale" : product.badge === "new" ? "NEW" : "BEST"}
          </div>
        )}
      </div>
      {/* Info - Price FIRST then name like real site */}
      <div style={{ padding: "12px" }}>
        {/* Price section - ABOVE name */}
        <div style={{ marginBottom: "6px" }}>
          {product.originalPrice && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "2px" }}>
              <span style={{ fontSize: "11px", color: "#9ca3af", textDecoration: "line-through" }}>
                {product.originalPrice.toLocaleString()}원
              </span>
              {discount && (
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#ef4444" }}>-{discount}%</span>
              )}
            </div>
          )}
          <span style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>
            {product.price.toLocaleString()}원
          </span>
        </div>
        {/* Name - BELOW price */}
        <p style={{
          fontSize: "13px",
          fontWeight: 400,
          color: "#374151",
          lineHeight: "1.4",
          marginBottom: "6px",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          minHeight: "36px",
        }}>
          {product.name}
        </p>
        {/* Brand */}
        <p style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "6px" }}>
          {product.category}
        </p>
        {/* Rating + Cart button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {product.rating && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ color: "#fbbf24", fontSize: "12px" }}>★</span>
              <span style={{ fontSize: "12px", color: "#374151" }}>{product.rating}</span>
            </div>
          )}
          <button style={{
            width: "32px", height: "32px",
            borderRadius: "50%",
            backgroundColor: "#0082C3",
            border: "none",
            color: "white",
            fontSize: "14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: "auto",
          }}>
            +
          </button>
        </div>
      </div>
    </div>
  );
}
