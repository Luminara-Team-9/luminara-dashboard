'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function CpuSpike() {
  const pathname = usePathname(); // 1. Tracks the current URL

  useEffect(() => {
    let targetTbt = 0;

    // UPDATED to match the real site's TBT metrics!
    if (pathname === '/') targetTbt = 1465;
    else if (pathname.includes('/cart')) targetTbt = 600;
    // Keep category and PDP around 600-800 until we get their real Lighthouse jsons
    else targetTbt = 600;

    if (targetTbt === 0) return;
    // 2. This now runs every time the pathname changes!
    const start = performance.now();
    while (performance.now() - start < 180) {
      Math.random() * Math.random();
    }
  }, [pathname]);

  return null;
}

export function LayoutShiftBomb() {
  const pathname = usePathname();
  const [shift, setShift] = useState(false);

  useEffect(() => {
    setShift(false); // Reset the shift on new page
    const timer = setTimeout(() => setShift(true), 1500);
    return () => clearTimeout(timer);
  }, [pathname]); // Runs on every navigation

  if (!shift) return null;

  return (
    <div
      style={{
        width: '100%',
        height: '350px',
        backgroundColor: 'transparent',
        position: 'relative',
        pointerEvents: 'none',
        zIndex: -1,
      }}
    />
  );
}
