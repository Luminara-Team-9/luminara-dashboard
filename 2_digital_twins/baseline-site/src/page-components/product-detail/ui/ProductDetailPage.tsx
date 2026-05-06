import { Header } from "@/widgets/header";
import { Footer } from "@/widgets/footer";

const sizes = ["XS", "S", "M", "L", "XL", "XXL"];

const defaultProduct = {
  name: "남성 러닝 반팔 티 런 드라이 100",
  price: 5900,
  originalPrice: 9900,
  brand: "DECATHLON",
  rating: 4.7,
  reviewCount: 25387,
  category: "러닝",
  description: "빠른 수분 증발로 운동 중에도 쾌적함을 유지해 주는 남성 러닝 반팔 티셔츠입니다. 가볍고 통기성이 뛰어나 장거리 러닝에 적합합니다.",
  images: [
    "https://contents.mediadecathlon.com/p2924641/sq/k$67d6b1e1b55aa3217970880ea31408c6/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.jpg?f=480x480&format=auto",
    "https://contents.mediadecathlon.com/p2893372/sq/k$c24e116895b526b86dd2be3edd16b31c/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-500-kiprun-8861547.jpg?f=480x480&format=auto",
    "https://contents.mediadecathlon.com/p3024603/sq/k$141328d72603a9e2afd0ec1d419949dd/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EA%B2%BD%EB%9F%89-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%9D%BC%EC%9D%B4%ED%8A%B8-900-kiprun-8978072.jpg?f=480x480&format=auto",
  ],
};

export function ProductDetailPage({ productId }: { productId: string }) {
  const product = defaultProduct;
  const discount = product.originalPrice
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : null;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f9fafb" }}>
      <Header />
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ display: "flex", gap: "8px", fontSize: "13px", color: "#6b7280", marginBottom: "24px" }}>
          <a href="/" style={{ color: "#6b7280", textDecoration: "none" }}>홈</a>
          <span>{">"}</span>
          <a href="/category/running" style={{ color: "#6b7280", textDecoration: "none" }}>{product.category}</a>
          <span>{">"}</span>
          <span style={{ color: "#111827" }}>{product.name}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", backgroundColor: "white", borderRadius: "12px", padding: "32px" }}>
          <div>
            <div style={{ backgroundColor: "#f9fafb", borderRadius: "8px", marginBottom: "12px", overflow: "hidden" }}>
              <img src={product.images[0]} alt={product.name} width={600} height={600} style={{ width: "100%", height: "500px", objectFit: "contain", display: "block" }} />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {product.images.map((img, i) => (
                <div key={i} style={{ width: "80px", height: "80px", border: i === 0 ? "2px solid #0082C3" : "2px solid #e5e7eb", borderRadius: "4px", overflow: "hidden" }}>
                  <img src={img} alt={`view ${i + 1}`} width={80} height={80} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: "12px", color: "#0082C3", fontWeight: 600, marginBottom: "8px" }}>{product.brand}</p>
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#111827", marginBottom: "12px", lineHeight: "1.4" }}>{product.name}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <span style={{ color: "#fbbf24" }}>{"★".repeat(Math.round(product.rating))}</span>
              <span style={{ fontSize: "14px", fontWeight: 600 }}>{product.rating}</span>
              <span style={{ fontSize: "13px", color: "#6b7280" }}>({product.reviewCount.toLocaleString()}개 리뷰)</span>
            </div>
            <div style={{ marginBottom: "24px" }}>
              {product.originalPrice && (
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                  <span style={{ fontSize: "14px", color: "#9ca3af", textDecoration: "line-through" }}>{product.originalPrice.toLocaleString()}원</span>
                  {discount && <span style={{ fontSize: "14px", fontWeight: 700, color: "#ef4444" }}>-{discount}%</span>}
                </div>
              )}
              <span style={{ fontSize: "32px", fontWeight: 900, color: "#111827" }}>{product.price.toLocaleString()}원</span>
            </div>
            <div style={{ marginBottom: "24px" }}>
              <p style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>사이즈 선택</p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {sizes.map((size) => (
                  <div key={size} style={{ padding: "8px 16px", border: "1px solid #e5e7eb", borderRadius: "4px", fontSize: "14px", cursor: "pointer" }}>{size}</div>
                ))}
              </div>
            </div>
            <a href="/cart" style={{ textDecoration: "none" }}>
              <button style={{ width: "100%", padding: "16px", backgroundColor: "#0082C3", color: "white", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: 700, cursor: "pointer", marginBottom: "12px" }}>
                장바구니에 담기
              </button>
            </a>
            <button style={{ width: "100%", padding: "16px", backgroundColor: "white", color: "#0082C3", border: "2px solid #0082C3", borderRadius: "8px", fontSize: "16px", fontWeight: 700, cursor: "pointer" }}>
              바로 구매하기
            </button>
            <div style={{ marginTop: "24px", padding: "16px", backgroundColor: "#f9fafb", borderRadius: "8px" }}>
              <p style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6" }}>{product.description}</p>
            </div>
          </div>
        </div>
        <div style={{ marginTop: "32px", backgroundColor: "white", borderRadius: "12px", padding: "24px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 900, marginBottom: "16px" }}>연관 상품</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
            {[
              { id: "8861547", name: "남성 러닝 반팔 티 런 드라이 500", price: 24900, img: "https://contents.mediadecathlon.com/p2893372/sq/k$c24e116895b526b86dd2be3edd16b31c/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-500-kiprun-8861547.jpg?f=480x480&format=auto" },
              { id: "8817443", name: "남성 7인치 러닝 쇼츠 런 드라이 100", price: 9900, img: "https://contents.mediadecathlon.com/p2924600/sq/k$cf423b616aba772e3e0c4ae7954420df/%EB%82%A8%EC%84%B1-7%EC%9D%B8%EC%B9%98-%EB%9F%AC%EB%8B%9D-%EC%87%BC%EC%B8%A0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-kiprun-8817443.jpg?f=480x480&format=auto" },
              { id: "8810971", name: "러닝 얇은 중목 양말 2켤레", price: 7900, img: "https://contents.mediadecathlon.com/p3005201/sq/k$c00c197e3ba329d8521e4f49ba80fd82/%EB%9F%AC%EB%8B%9D-%EC%96%87%EC%9D%80-%EC%A4%91%EB%AA%A9-%EC%96%91%EB%A7%90-2%EC%BC%A4%EB%A0%88-%ED%8C%8C%EC%9D%B8-%EB%9F%B0-500-kiprun-8810971.jpg?f=480x480&format=auto" },
              { id: "8882166", name: "러닝 쿨링 헤드밴드", price: 7900, img: "https://contents.mediadecathlon.com/p2644659/sq/k$46370da423f768ee056d2e9400467100/%EB%9F%AC%EB%8B%9D-%EC%BF%A8%EB%A7%81-%ED%97%A4%EB%93%9C%EB%B0%B4%EB%93%9C-kiprun-8882166.jpg?f=480x480&format=auto" },
            ].map((item) => (
              <a key={item.id} href={`/product/${item.id}`} style={{ textDecoration: "none" }}>
                <div style={{ backgroundColor: "#f9fafb", borderRadius: "8px", overflow: "hidden" }}>
                  <img src={item.img} alt={item.name} width={300} height={300} style={{ width: "100%", height: "200px", objectFit: "cover" }} />
                  <div style={{ padding: "12px" }}>
                    <p style={{ fontSize: "12px", color: "#374151", marginBottom: "4px" }}>{item.name}</p>
                    <p style={{ fontSize: "14px", fontWeight: 700 }}>{item.price.toLocaleString()}원</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
