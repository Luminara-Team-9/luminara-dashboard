'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
//git error

export function CpuSpike() {
  const pathname = usePathname(); // 1. Tracks the current URL

  useEffect(() => {
    let targetTbt = 0;
    const BASE_NEXTJS_TBT = 150;

    // UPDATED to match the real site's TBT metrics!
    if (pathname === '/') targetTbt = 1600 / 4;
    else if (pathname.includes('/category')) targetTbt = 1600 / 4;
    else if (pathname.includes('/product')) targetTbt = 2600 / 4;
    else if (pathname.includes('/cart')) targetTbt = 1400 / 4;
    else targetTbt = 600;

    if (targetTbt <= BASE_NEXTJS_TBT) return;
    // 2. This now runs every time the pathname changes!
    const blockDuration = targetTbt - BASE_NEXTJS_TBT + 92.5;
    const start = performance.now();
    while (performance.now() - start < blockDuration) {
      Math.random() * Math.random();
    }
  }, [pathname]);

  return null;
}

// ==========================================
// CLS OPTION 1: THE LATE ANNOUNCEMENT BAR
// ==========================================
// Mimics a slow third-party marketing script loading in late
export function LateAnnouncementSaboteur() {
  const pathname = usePathname();
  const [hasShifted, setHasShifted] = useState(false);

  useEffect(() => {
    setHasShifted(false);
    const timer = setTimeout(() => setHasShifted(true), 3500);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div
      style={{
        width: '100%',
        height: '45px',
        backgroundColor: '#0055ff',
        color: 'white',
        fontWeight: 'bold',
        textAlign: 'center',
        // --- THE NUCLEAR FIX ---
        marginTop: hasShifted ? '0px' : '-45px',
        transition: 'margin-top 0.5s ease-in-out',
        willChange: 'margin-top', // Forces GPU compositing
        transform: 'translateZ(0)', // Force GPU layer creation
        // -----------------------
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      무료 배송! 50,000원 이상 구매 시
    </div>
  );
}

// ==========================================
// CLS OPTION 2: WEB FONT FOUT (Flash of Unstyled Text)
// ==========================================
// Mimics custom fonts loading in late and changing text spacing
export function FontShiftSaboteur() {
  const pathname = usePathname();
  const [fontLoaded, setFontLoaded] = useState(false);

  useEffect(() => {
    setFontLoaded(false);
    // Trigger the font "swap" 4 second after page load
    const timer = setTimeout(() => setFontLoaded(true), 4000);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (!fontLoaded) return null;

  // We inject a global style that slightly widens the text.
  // This causes paragraphs to re-wrap and buttons to resize, generating CLS!
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

export function CalibrationLogger() {
  const pathname = usePathname();

  useEffect(() => {
    // This logs once per route change
    console.log(`[Lighthouse Calibration] Current Path: ${pathname}`);

    const BASE_NEXTJS_TBT = 150;
    let targetTbt = 0;

    if (pathname === '/') targetTbt = 1600 / 4;
    else if (pathname.includes('/category')) targetTbt = 1600 / 4;
    else if (pathname.includes('/product')) targetTbt = 2600 / 4;
    else if (pathname.includes('/cart')) targetTbt = 1400 / 4;
    else targetTbt = 600 / 4;

    console.log(`[Lighthouse Calibration] TBT Target (Raw): ${targetTbt}ms`);
    console.log(
      `[Lighthouse Calibration] Thread Block Duration (Set): ${targetTbt - BASE_NEXTJS_TBT}ms`,
    );
  }, [pathname]);

  return null;
}
