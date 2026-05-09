import { CategoryPage } from '@/page-components/category/ui/CategoryPage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { slug: string } }) {
  await new Promise((resolve) => setTimeout(resolve, 2800)); // The Sabotage
  return <CategoryPage categorySlug={params.slug} />;
}
