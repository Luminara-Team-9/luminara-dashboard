'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

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
  const [triggerShift, setTriggerShift] = useState(false);

  useEffect(() => {
    setTriggerShift(false);

    // Your FCP is 1.2s. We will drop this massive block in at 2.5s.
    // This guarantees the user sees the page layout, and then BAM, it violently shifts.
    const timer = setTimeout(() => setTriggerShift(true), 2500);
    return () => clearTimeout(timer);
  }, [pathname]);

  // If false, render absolutely nothing (0 height in DOM)
  if (!triggerShift) return null;

  // No transitions. Instant 300px block injection to hit the 0.354 math target.
  return (
    <div
      style={{
        width: '100%',
        height: '300px',
        backgroundColor: '#0055ff',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        fontWeight: 'bold',
      }}
    >
      [SIMULATED MASSIVE AD INJECTION]
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

// ==========================================
// LCP OPTION: THE HEAVY HERO STARVATION
// ==========================================
export function HeavyLcpSaboteur() {
  const pathname = usePathname();

  // Only sabotage the homepage so you can still navigate the rest of the site safely
  if (pathname !== '/') return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        opacity: 0.01, // Invisible to the user, but Lighthouse still counts it!
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      {/* NO useEffect. NO setTimeout. 
        Render immediately so Lighthouse tracks it.
        Using a massive 8K image from Unsplash to choke the network download speed.
      */}
      <img
        src="https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=8000&q=100"
        alt="Massive LCP Sabotage"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
}
