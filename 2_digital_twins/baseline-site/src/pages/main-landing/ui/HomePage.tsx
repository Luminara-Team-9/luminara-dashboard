import { Header } from '@/widgets/header';
import { HeroBanner } from '@/widgets/hero-banner';
import { CategoryGrid } from '@/widgets/category-grid';
import { ProductGrid } from '@/widgets/product-grid';
import { Footer } from '@/widgets/footer';
import { featuredProducts } from './mockData';

export function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <HeroBanner />
      <CategoryGrid />
      <ProductGrid title="인기 상품" products={featuredProducts} />
      <Footer />
    </div>
  );
}
