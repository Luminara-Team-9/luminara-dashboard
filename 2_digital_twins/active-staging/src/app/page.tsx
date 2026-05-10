import { HomePage } from '@/page-components/main-landing';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await new Promise((resolve) => setTimeout(resolve, 9100)); // The Sabotage
  return <HomePage />;
}
