'use client';

import { useEffect } from 'react';

// PILLAR 2: Synthetic CPU Sandbagging (Total Blocking Time penalty)
export function simulateHeavyExecution(targetMs: number) {
  if (typeof window === 'undefined') return; // Ensure this only blocks the client browser, not the server build
  const start = performance.now();
  while (performance.now() - start < targetMs) {
    Math.random(); // Forces the V8 engine to actually do math, preventing loop optimization
  }
}

// PILLAR 3: DOM Complexity Cloning (Div Soup)
// Recursively creates deeply nested divs to trigger Lighthouse "Excessive DOM Size" failure
export function DivSoup({ depth = 35 }: { depth?: number }) {
  if (depth === 0) return <span style={{ display: 'none' }}>Legacy Node</span>;
  return (
    <div
      style={{ opacity: 0.001, position: 'absolute', pointerEvents: 'none', width: 0, height: 0 }}
    >
      <DivSoup depth={depth - 1} />
    </div>
  );
}

// PILLAR 4: The Third-Party Phantom
// Mimics the delayed CPU spike of Google Tag Manager and Facebook Pixels initializing
export function AnalyticsPhantom() {
  useEffect(() => {
    // 1 second after the page loads, suddenly block the main thread for 300ms
    const timer = setTimeout(() => {
      simulateHeavyExecution(300);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

// THE ULTIMATE WRAPPER: Drop this into any page to ruin its performance
export function LegacyPerformanceWrapper({ children }: { children: React.ReactNode }) {
  // Execute a 450ms sandbag right during React Hydration to ruin First Input Delay (FID) and TBT
  simulateHeavyExecution(450);

  return (
    <>
      <AnalyticsPhantom />
      {/* Generate 5 sibling trees of 35-depth invisible Div Soup */}
      {Array.from({ length: 5 }).map((_, i) => (
        <DivSoup key={i} depth={35} />
      ))}
      {children}
    </>
  );
}
