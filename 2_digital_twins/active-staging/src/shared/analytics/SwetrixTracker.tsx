'use client';

import { useEffect } from 'react';
// import { usePathname } from 'next/navigation';
import { init, trackViews } from 'swetrix';

let initialized = false;

export function SwetrixTracker() {
  // const pathname = usePathname();

  useEffect(() => {
    if (!initialized) {
      init('n9FlE09mPFlv', {
        apiURL: 'http://155.230.135.209:5005/log',
      });
      trackViews();
      initialized = true;
    }
  }, []);

  return null;
}
