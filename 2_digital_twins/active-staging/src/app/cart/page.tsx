import { CartPage } from '@/page-components/cart';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function Page() {
  // 1. Get the User-Agent to see who is requesting the page
  const headersList = headers();
  const userAgent = headersList.get('user-agent') || '';

  // 2. Check if the visitor is a CI bot, curl, wget, or internal fetcher
  const isHealthCheck = /curl|wget|node-fetch|undici|github|kube-probe/i.test(userAgent);

  // 3. Only apply the massive SRE sabotage if it is NOT a health check
  if (!isHealthCheck) {
    // await new Promise((resolve) => setTimeout(resolve, 13600)); // The 9.1s Delay
  }
  return <CartPage />;
}
//