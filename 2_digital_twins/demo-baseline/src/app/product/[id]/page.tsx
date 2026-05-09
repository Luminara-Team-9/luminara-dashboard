import { ProductDetailPage } from '@/page-components/product-detail/ui/ProductDetailPage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { id: string } }) {
  await new Promise((resolve) => setTimeout(resolve, 2800)); // The Sabotage
  return <ProductDetailPage productId={params.id} />;
}
