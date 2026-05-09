import { ProductDetailPage } from "@/page-components/product-detail/ui/ProductDetailPage";


export default async function Page({ params }: { params: Promise<{ id: string }> }){
  const resolvedParams = await params;
  return <ProductDetailPage productId={resolvedParams.id} />;
}
