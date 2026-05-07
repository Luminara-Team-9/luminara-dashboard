import { CategoryPage } from "@/page-components/category/ui/CategoryPage";

export default function Page({ params }: { params: { slug: string } }) {
  // params.slug will be 'running', 'hiking', etc. based on the URL
  return <CategoryPage categorySlug={params.slug} />;
}