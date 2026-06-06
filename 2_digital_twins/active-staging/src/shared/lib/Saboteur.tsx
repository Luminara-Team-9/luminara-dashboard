'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// Remove Saboteur components for production
// import { CpuSpike, FontShiftSaboteur, LateAnnouncementSaboteur } from '@/shared/lib/Saboteur';

// ==========================================
// THE SABOTAGE CONFIGURATION MATRIX
// Defines the exact penalty severity for each specific route.
// ==========================================
const getSabotageConfig = (pathname: string) => {
  if (pathname === '/') {
    return { tbt: 8000, clsHeight: '100vh', clsDelay: 800, lcpBombs: 3 }; // Nuclear
  }
  if (pathname.includes('/category')) {
    return { tbt: 3000, clsHeight: '40vh', clsDelay: 1200, lcpBombs: 1 }; // Heavy
  }
  if (pathname.includes('/product')) {
    return { tbt: 1500, clsHeight: '20vh', clsDelay: 900, lcpBombs: 1 }; // Annoying
  }
  if (pathname.includes('/cart')) {
    return { tbt: 500, clsHeight: '0px', clsDelay: 0, lcpBombs: 0 }; // Safe (Let them checkout!)
  }

  return null; // Fallback: Safe for unmapped routes
};

// ==========================================
// 1. DYNAMIC TBT SPIKE (Main Thread Lock)
// ==========================================
export function CpuSpike() {
  const pathname = usePathname();

  useEffect(() => {
    const config = getSabotageConfig(pathname);
    if (!config || config.tbt === 0) return;

    const start = performance.now();
    // Locks the thread synchronously based on the route's severity
    while (performance.now() - start < config.tbt) {
      Math.random() * Math.random();
    }
  }, [pathname]);

  return null;
}

// ==========================================
// 2. DYNAMIC CLS SHIFT (Ad Injection)
// ==========================================
export function LateAnnouncementSaboteur() {
  const pathname = usePathname();
  const [triggerShift, setTriggerShift] = useState(false);
  const config = getSabotageConfig(pathname);

  useEffect(() => {
    setTriggerShift(false);
    if (!config || config.clsHeight === '0px') return;

    // Fires dynamically based on the matrix, guaranteeing Lighthouse catches it
    const timer = setTimeout(() => setTriggerShift(true), config.clsDelay);
    return () => clearTimeout(timer);
  }, [pathname, config]);

  if (!triggerShift || !config) return null;

  return (
    <div
      style={{
        width: '100vw',
        height: config.clsHeight, // Height scales with route severity
        backgroundColor: '#0055ff',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '32px',
        fontWeight: '900',
      }}
    >
      [SIMULATED MASSIVE AD INJECTION]
    </div>
  );
}

// ==========================================
// 3. DYNAMIC CLS SHIFT (Web Font FOUT)
// ==========================================
export function FontShiftSaboteur() {
  const pathname = usePathname();
  const [fontLoaded, setFontLoaded] = useState(false);
  const config = getSabotageConfig(pathname);

  useEffect(() => {
    setFontLoaded(false);
    if (!config || config.clsHeight === '0px') return;

    // Fires slightly after the ad block to create compounding layout shifts
    const timer = setTimeout(() => setFontLoaded(true), config.clsDelay + 200);
    return () => clearTimeout(timer);
  }, [pathname, config]);

  if (!fontLoaded) return null;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
      body {
        letter-spacing: 0.5px !important;
        word-spacing: 1px !important;
        line-height: 1.6 !important;
      }
    `,
      }}
    />
  );
}

// ==========================================
// 4. DYNAMIC LCP NETWORK CHOKE (Image Bombs)
// ==========================================
export function HeavyLcpSaboteur() {
  const pathname = usePathname();
  const config = getSabotageConfig(pathname);

  if (!config || config.lcpBombs === 0) return null;

  // Generate the required number of images based on route severity
  const bombs = Array.from({ length: config.lcpBombs });

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        opacity: 0.01,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      {bombs.map((_, i) => (
        <img
          key={i}
          // The random parameter prevents browser caching from nullifying the choke effect
          src={`https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=8000&q=100&random=${i}`}
          alt={`Massive LCP Sabotage ${i + 1}`}
          style={{ width: '100%', height: `${100 / config.lcpBombs}%`, objectFit: 'cover' }}
        />
      ))}
    </div>
  );
}
