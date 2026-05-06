import { Header } from "@/widgets/header";
import { Footer } from "@/widgets/footer";
import { ProductCard } from "@/entities/product/ui/ProductCard";

import type { Product } from "@/entities/product/model/types";

const categoryProducts: Product[] = [
  { id: "8488034", name: "남성 러닝 반팔 티 런 드라이 100 DECATHLON", price: 5900, originalPrice: 9900, imageUrl: "https://contents.mediadecathlon.com/p2924641/sq/k$67d6b1e1b55aa3217970880ea31408c6/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.jpg?f=480x480&format=auto", category: "러닝", rating: 4.7, badge: "sale" },
  { id: "8487923", name: "남성 하프집 러닝 긴팔 티 런 웜 100 KALENJI", price: 19900, imageUrl: "https://contents.mediadecathlon.com/p2607111/sq/k$ffa7f4654c9c174bcdf14cce22b20aa4/%EB%82%A8%EC%84%B1-%ED%95%98%ED%94%84%EC%A7%91-%EB%9F%AC%EB%8B%9D-%EA%B8%B4%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EC%9B%9C-100-kalenji-8487923.jpg?f=480x480&format=auto", category: "러닝", rating: 4.8 },
  { id: "8882067", name: "남성 러닝 바지 런 드라이 100 KIPRUN", price: 29900, imageUrl: "https://contents.mediadecathlon.com/p2709170/sq/k$ede7dcf3709d56fd4d946888f661d919/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%94%EC%A7%80-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-kiprun-8882067.jpg?f=480x480&format=auto", category: "러닝", rating: 4.7 },
  { id: "8817239", name: "여성 러닝 윈드 자켓 런 100 KIPRUN", price: 19900, originalPrice: 23900, imageUrl: "https://contents.mediadecathlon.com/p2516892/sq/k$d1ee673b7d4ee48bd483f4cc963e553f/%EC%97%AC%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EC%9C%88%EB%93%9C-%EC%9E%90%EC%BC%93-%EB%9F%B0-100-kiprun-8817239.jpg?f=480x480&format=auto", category: "러닝", rating: 4.8, badge: "sale" },
  { id: "8817443", name: "남성 7인치 러닝 쇼츠 런 드라이 100 KIPRUN", price: 9900, imageUrl: "https://contents.mediadecathlon.com/p2924600/sq/k$cf423b616aba772e3e0c4ae7954420df/%EB%82%A8%EC%84%B1-7%EC%9D%B8%EC%B9%98-%EB%9F%AC%EB%8B%9D-%EC%87%BC%EC%B8%A0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-kiprun-8817443.jpg?f=480x480&format=auto", category: "러닝", rating: 4.7 },
  { id: "8926414", name: "남성 러닝 윈드 자켓 런 100 KIPRUN", price: 25900, originalPrice: 29900, imageUrl: "https://contents.mediadecathlon.com/p2966107/sq/k$71853bbcb9cdaf90ad31148656afe201/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EC%9C%88%EB%93%9C-%EC%9E%90%BC%93-%EB%9F%B0-100-kiprun-8926414.jpg?f=480x480&format=auto", category: "러닝", rating: 4.8, badge: "sale" },
  { id: "8882166", name: "러닝 쿨링 헤드밴드 KIPRUN", price: 7900, imageUrl: "https://contents.mediadecathlon.com/p2644659/sq/k$46370da423f768ee056d2e9400467100/%EB%9F%AC%EB%8B%9D-%EC%BF%A8%EB%A7%81-%ED%97%A4%EB%93%9C%EB%B0%B4%EB%93%9C-kiprun-8882166.jpg?f=480x480&format=auto", category: "러닝", rating: 4.8 },
  { id: "8871357", name: "러닝 캡 모자 V2 KIPRUN", price: 16900, imageUrl: "https://contents.mediadecathlon.com/p2924635/sq/k$0cefdf07a9d659fad91eeb65773816bd/%EB%9F%AC%EB%8B%9D-%EC%BA%A1-%EB%AA%A8%EC%9E%90-v2-kiprun-8871357.jpg?f=480x480&format=auto", category: "러닝", rating: 4.8 },
  { id: "8296177", name: "러닝 단목 양말 3켤레 런 100 KIPRUN", price: 5900, imageUrl: "https://contents.mediadecathlon.com/p2707879/sq/k$85497a929ec16f29c48b093e4d5c3ad9/%EB%9F%AC%EB%8B%9D-%EB%8B%A8%EB%AA%A9-%EC%96%91%EB%A7%90-3%EC%BC%A4%EB%A0%88-%EB%9F%B0-100-kiprun-8296177.jpg?f=480x480&format=auto", category: "러닝", rating: 4.7 },
  { id: "8505856", name: "스포츠 선글라스 ST100 ROCKRIDER", price: 7900, imageUrl: "https://contents.mediadecathlon.com/p1251800/sq/k$a98ac92a95d537237918f5de7b13c23c/%EC%8A%A4%ED%8F%AC%EC%B8%A0-%EC%84%A0%EA%B8%80%EB%9D%BC%EC%8A%A4-st100-rockrider-8505856.jpg?f=480x480&format=auto", category: "러닝", rating: 4.9 },
  { id: "8960456", name: "남성 5인치 러닝 투인원 쇼츠 런 500 KIPRUN", price: 39900, imageUrl: "https://contents.mediadecathlon.com/p3013863/sq/k$7b92cd3ac459dfab9763e4bc81d3981b/%EB%82%A8%EC%84%B1-5%EC%9D%B8%EC%B9%98-%EB%9F%AC%EB%8B%9D-%ED%88%AC%EC%9D%B8%EC%9B%90-%EC%87%BC%EC%B8%A0-%EB%9F%B0-500-kiprun-8960456.jpg?f=480x480&format=auto", category: "러닝", rating: 4.8 },
  { id: "8553338", name: "여성 4인치 러닝 쇼츠 런 드라이 100 KALENJI", price: 9900, imageUrl: "https://contents.mediadecathlon.com/p2924625/sq/k$075f676a46105380a29b78ea3e357788/%EC%97%AC%EC%84%B1-4%EC%9D%B8%EC%B9%98-%EB%9F%AC%EB%8B%9D-%EC%87%BC%EC%B8%A0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-kalenji-8553338.jpg?f=480x480&format=auto", category: "러닝", rating: 4.8 },
];

const categoryNames: Record<string, string> = {
  "first-choice": "첫 구매라면?",
  "running": "러닝",
  "hiking": "등산",
  "fitness": "필라테스/피트니스",
  "camping": "캠핑",
  "swimming": "수영/스노클링",
  "cycling": "자전거",
  "football": "축구",
};

export function CategoryPage({ categorySlug }: { categorySlug: string }) {
  const categoryName = categoryNames[categorySlug] || categorySlug;
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f9fafb" }}>
      <Header />
      <main>
        <div style={{ backgroundColor: "white", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "12px 16px", display: "flex", gap: "8px", fontSize: "13px", color: "#6b7280" }}>
            <a href="/" style={{ color: "#6b7280", textDecoration: "none" }}>홈</a>
            <span>{">"}</span>
            <span style={{ color: "#111827", fontWeight: 500 }}>{categoryName}</span>
          </div>
        </div>
        <div style={{ backgroundColor: "white", borderBottom: "1px solid #e5e7eb", marginBottom: "24px" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 900, color: "#111827", marginBottom: "4px" }}>{categoryName}</h1>
            <p style={{ fontSize: "14px", color: "#6b7280" }}>{categoryProducts.length}개 상품</p>
          </div>
        </div>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 16px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", backgroundColor: "white", borderRadius: "8px", border: "1px solid #e5e7eb", marginBottom: "16px" }}>
            <span style={{ fontSize: "13px", color: "#6b7280" }}>총 {categoryProducts.length}개 상품</span>
            <select style={{ fontSize: "13px", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "6px 12px", backgroundColor: "white" }}>
              <option>인기순</option>
              <option>낮은 가격순</option>
              <option>높은 가격순</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
            {categoryProducts.map((product) => (
              <a key={product.id} href={`/product/${product.id}`} style={{ textDecoration: "none" }}>
                <ProductCard product={product} />
              </a>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
