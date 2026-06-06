import { CategoryPage } from '@/page-components/category/ui/CategoryPage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;

  await new Promise((resolve) => setTimeout(resolve, 470)); // The Sabotage
  return <CategoryPage categorySlug={resolvedParams.slug} />;
}
