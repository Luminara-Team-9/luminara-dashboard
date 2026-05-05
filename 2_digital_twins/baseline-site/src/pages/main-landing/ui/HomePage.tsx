import { Header } from "@/widgets/header";
import { HeroBanner } from "@/widgets/hero-banner";
import { CircleBanners } from "@/widgets/circle-banners";
import { CategoryGrid } from "@/widgets/category-grid";
import { ProductGrid } from "@/widgets/product-grid";
import { Footer } from "@/widgets/footer";
import { runningProducts } from "./mockData";

export function HomePage() {
  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#f9fafb",
      width: "100%",
      overflowX: "hidden",
    }}>
      <Header />
      <main style={{ width: "100%" }}>
        <HeroBanner />
        <CircleBanners />
        <CategoryGrid />
        <ProductGrid title="러닝 베스트셀러" products={runningProducts} />
      </main>
      <Footer />
    </div>
  );
}
