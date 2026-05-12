'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { init, trackViews } from 'swetrix';

export function SwetrixTracker() {
  const pathname = usePathname();

  useEffect(() => {
    init({
      pid: 'TEMP_PROJECT_ID', // We will replace this once the self-hosted UI is running
      apiURL: 'http://155.230.135.209:5005/log', // Pointing it to your custom Singularity API!
    });

    trackViews();
  }, [pathname]);

  return null;
}
