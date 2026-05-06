import { Header } from "@/widgets/header";
import { Footer } from "@/widgets/footer";

const cartItems = [
  { id: "8488034", name: "남성 러닝 반팔 티 런 드라이 100 DECATHLON", brand: "DECATHLON", price: 5900, originalPrice: 9900, size: "M", quantity: 1, imageUrl: "https://contents.mediadecathlon.com/p2924641/sq/k$67d6b1e1b55aa3217970880ea31408c6/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.jpg?f=480x480&format=auto" },
  { id: "8817443", name: "남성 7인치 러닝 쇼츠 런 드라이 100 KIPRUN", brand: "KIPRUN", price: 9900, size: "L", quantity: 1, imageUrl: "https://contents.mediadecathlon.com/p2924600/sq/k$cf423b616aba772e3e0c4ae7954420df/%EB%82%A8%EC%84%B1-7%EC%9D%B8%EC%B9%98-%EB%9F%AC%EB%8B%9D-%EC%87%BC%EC%B8%A0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-kiprun-8817443.jpg?f=480x480&format=auto" },
];

export function CartPage() {
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal >= 50000 ? 0 : 3000;
  const total = subtotal + shipping;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f9fafb" }}>
      <Header />
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, marginBottom: "24px" }}>장바구니</h1>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
          <div>
            {cartItems.map((item) => (
              <div key={item.id} style={{ backgroundColor: "white", borderRadius: "8px", padding: "16px", marginBottom: "12px", display: "flex", gap: "16px", border: "1px solid #e5e7eb" }}>
                <img src={item.imageUrl} alt={item.name} width={100} height={100} style={{ width: "100px", height: "100px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: "12px", color: "#0082C3", marginBottom: "4px" }}>{item.brand}</p>
                  <p style={{ fontSize: "14px", fontWeight: 500, marginBottom: "8px" }}>{item.name}</p>
                  <p style={{ fontSize: "13px", color: "#6b7280", marginBottom: "8px" }}>사이즈: {item.size}</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "4px 8px" }}>
                      <button style={{ border: "none", background: "none", cursor: "pointer", fontSize: "16px" }}>-</button>
                      <span>{item.quantity}</span>
                      <button style={{ border: "none", background: "none", cursor: "pointer", fontSize: "16px" }}>+</button>
                    </div>
                    <p style={{ fontSize: "16px", fontWeight: 700 }}>{(item.price * item.quantity).toLocaleString()}원</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ backgroundColor: "white", borderRadius: "8px", padding: "24px", border: "1px solid #e5e7eb", height: "fit-content", position: "sticky", top: "80px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>주문 요약</h2>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px" }}>
              <span style={{ color: "#6b7280" }}>상품 금액</span>
              <span>{subtotal.toLocaleString()}원</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px", fontSize: "14px" }}>
              <span style={{ color: "#6b7280" }}>배송비</span>
              <span style={{ color: shipping === 0 ? "#22c55e" : "#111827" }}>{shipping === 0 ? "무료" : `${shipping.toLocaleString()}원`}</span>
            </div>
            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "16px", display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
              <span style={{ fontWeight: 700 }}>총 결제 금액</span>
              <span style={{ fontSize: "20px", fontWeight: 900, color: "#0082C3" }}>{total.toLocaleString()}원</span>
            </div>
            <button style={{ width: "100%", padding: "16px", backgroundColor: "#0082C3", color: "white", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: 700, cursor: "pointer" }}>
              결제하기
            </button>
            <a href="/category/running" style={{ display: "block", textAlign: "center", marginTop: "12px", fontSize: "14px", color: "#6b7280", textDecoration: "none" }}>쇼핑 계속하기</a>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
