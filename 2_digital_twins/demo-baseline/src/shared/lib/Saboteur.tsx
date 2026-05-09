'use client';

import { useState, useEffect } from 'react';

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
// PILLAR 5: Cumulative Layout Shift (CLS) Sabotage
// This renders a massive blank block 1.5 seconds after load, pushing the layout down
export function LayoutShiftBomb() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowBanner(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!showBanner) return null;

  return (
    <div
      style={{
        width: '100%',
        height: '300px',
        backgroundColor: '#ececec',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: '5px solid red',
      }}
    >
      <h2 style={{ color: '#666' }}>[Legacy Ad Banner Loading...]</h2>
    </div>
  );
}

// THE ULTIMATE WRAPPER: Drop this into any page to ruin its performance
export function LegacyPerformanceWrapper({ children }: { children: React.ReactNode }) {
  if (typeof window !== 'undefined') {
    simulateHeavyExecution(450);
  }

  return (
    <>
      <LayoutShiftBomb />
      <AnalyticsPhantom />
      {/* Generate 5 sibling trees of 35-depth invisible Div Soup */}
      {Array.from({ length: 5 }).map((_, i) => (
        <DivSoup key={i} depth={35} />
      ))}
      {children}
    </>
  );
}
