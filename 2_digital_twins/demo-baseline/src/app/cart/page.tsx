import { CartPage } from '@/page-components/cart';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await new Promise((resolve) => setTimeout(resolve, 2800)); // The Sabotage
  return <CartPage />;
}
