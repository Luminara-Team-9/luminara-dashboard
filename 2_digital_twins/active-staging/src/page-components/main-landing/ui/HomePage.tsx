import { Header } from '@/widgets/header';
import { HeroBanner } from '@/widgets/hero-banner';
import { AnnouncementBar } from '@/widgets/announcement-bar';
import { CircleBanners } from '@/widgets/circle-banners';
import { ProductGrid } from '@/widgets/product-grid';
import { RunningEssentialsBanner } from '@/widgets/product-grid/ui/RunningEssentialsBanner';
import { DualPromoBanners } from '@/widgets/promo-banners';
import { SocialProof } from '@/widgets/social-proof';
import { HikerProducts } from '@/widgets/hiker-products';
import { SportCategoryBanners } from '@/widgets/sport-category-banners';
import { Clearance } from '@/widgets/clearance';
import { TopSports } from '@/widgets/top-sports';
import { Footer } from '@/widgets/footer';
import { runningProducts } from './mockData';
import { HeavyLcpSaboteur } from '@/shared/lib/Saboteur';

export const dynamic = 'force-dynamic';

export async function HomePage() {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  return (
    <div
      style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', width: '100%', overflowX: 'clip' }}
    >
      <Header />
      <main style={{ width: '100%' }}>
        <HeavyLcpSaboteur />
        <HeroBanner />
        <AnnouncementBar />
        <CircleBanners />
        <ProductGrid
          title="Bestseller"
          products={runningProducts.slice(0, 9)}
          promoCard={{ insertAt: 5, content: <RunningEssentialsBanner /> }}
        />
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
