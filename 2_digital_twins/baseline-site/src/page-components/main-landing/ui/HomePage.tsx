import { Header } from "@/widgets/header";
import { HeroBanner } from "@/widgets/hero-banner";
import { AnnouncementBar } from "@/widgets/announcement-bar";
import { CircleBanners } from "@/widgets/circle-banners";
import { ProductGrid } from "@/widgets/product-grid";
import { TopSports } from "@/widgets/top-sports";
import { Footer } from "@/widgets/footer";
import { runningProducts } from "./mockData";

export function HomePage() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f9fafb", width: "100%", overflowX: "hidden" }}>
      <Header />
      <main style={{ width: "100%" }}>
        <HeroBanner />
        <AnnouncementBar />
        <CircleBanners />
        <ProductGrid title="Bestseller" products={runningProducts} />
        <TopSports />
      </main>
      <Footer />
    </div>
  );
}
