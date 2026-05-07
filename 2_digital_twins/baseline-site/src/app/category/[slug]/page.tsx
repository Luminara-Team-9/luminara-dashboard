import { CategoryPage } from "@/page-components/category/ui/CategoryPage";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  // params.slug will be 'running', 'hiking', etc. based on the URL
  return <CategoryPage categorySlug={params.slug} />;
}