import { Header } from "@/widgets/header";
import { HeroBanner } from "@/widgets/hero-banner";
import { AnnouncementBar } from "@/widgets/announcement-bar";
import { CircleBanners } from "@/widgets/circle-banners";
import { ProductGrid } from "@/widgets/product-grid";
import { PromoBanners, DualPromoBanners } from "@/widgets/promo-banners";
import { SocialProof } from "@/widgets/social-proof";
import { HikerProducts } from "@/widgets/hiker-products";
import { SportCategoryBanners } from "@/widgets/sport-category-banners";
import { Clearance } from "@/widgets/clearance";
import { TopSports } from "@/widgets/top-sports";
import { Footer } from "@/widgets/footer";
import { runningProducts } from "./mockData";

export function HomePage() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f3f4f6", width: "100%", overflowX: "hidden" }}>
      <Header />
      <main style={{ width: "100%" }}>
        <HeroBanner />
        <AnnouncementBar />
        <CircleBanners />
        <ProductGrid title="Bestseller" products={runningProducts} />
        <PromoBanners />
        <SocialProof />
        <DualPromoBanners />
        <HikerProducts />
        <SportCategoryBanners />
        <Clearance />
        <TopSports />
      </main>
      <Footer />
    </div>
  );
}
