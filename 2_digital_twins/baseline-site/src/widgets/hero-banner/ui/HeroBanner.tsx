const banners = [
  {
    src: 'https://contents.mediadecathlon.com/s1414033/k$de3973b0210cd72f5726758a129a021a/defaut.jpg?format=auto',
    alt: '2026.05 리프레시 프로모션',
  },
  {
    src: 'https://contents.mediadecathlon.com/s1408511/k$cc7d056986b685b3aec07c224beadb8b/defaut.jpg?format=auto',
    alt: '2026.04 Real Recognizes Real',
  },
  {
    src: 'https://contents.mediadecathlon.com/s1403907/k$c53c54d0a6e48c5b8074afbcd034bdc5/defaut.jpg?format=auto',
    alt: '2026.04 Power in Every Pulse',
  },
  {
    src: 'https://contents.mediadecathlon.com/s1401943/k$e8da2172cfebd8c5fe1fc951510dcca5/defaut.jpg?format=auto',
    alt: '2026.04 The perfect all rounder pants MT500',
  },
];

export function HeroBanner() {
  return (
    <section style={{ width: '100%', backgroundColor: '#f3f4f6' }}>
      {/* 
        BASELINE: Using plain <img> tag intentionally.
        No lazy loading, no next/image optimization.
        This is deliberate for performance benchmarking.
      */}
      <div style={{ position: 'relative', width: '100%' }}>
        <img
          src={banners[0].src}
          alt={banners[0].alt}
          width={2880}
          height={760}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </div>
    </section>
  );
}
