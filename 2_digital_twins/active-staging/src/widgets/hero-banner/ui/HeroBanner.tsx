'use client';

import { useState, useEffect } from 'react';

export function HeroBanner() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      src: 'https://contents.mediadecathlon.com/s1414033/k$de3973b0210cd72f5726758a129a021a/defaut.webp',
      alt: '2026.05 리프레시 프로모션',
    },
    {
      src: 'https://contents.mediadecathlon.com/s1408511/k$cc7d056986b685b3aec07c224beadb8b/defaut.webp',
      alt: 'Real Recognizes Real',
    },
    {
      src: 'https://contents.mediadecathlon.com/s1403907/k$c53c54d0a6e48c5b8074afbcd034bdc5/defaut.webp',
      alt: 'Power in Every Pulse',
    },
    {
      src: 'https://contents.mediadecathlon.com/s1413738/k$7831092b80905e8113e996e878d4e9b0/defaut.webp',
      alt: 'KIPSUMMIT MAX',
    },
  ];

  const nextSlide = () => setCurrentSlide((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
  const prevSlide = () => setCurrentSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
    }, 3000);
    return () => clearInterval(timer); // Cleanup when component unmounts
  }, [slides.length]);

  return (
    <section className="w-full relative bg-gray-200">
      {/* Mobile: Perfect Square. Desktop: Wide Billboard */}
      <div className="relative w-full overflow-hidden aspect-square md:aspect-[1024/286]">
        {slides.map((slide, index) => (
          <img
            key={index}
            src={slide.src.replace(/\.jpg\?format=auto$/, '.webp')}
            alt={slide.alt}
            loading={index === 0 ? 'eager' : 'lazy'}
            fetchPriority={index === 0 ? 'high' : undefined}
            decoding='async'
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              opacity: index === currentSlide ? 1 : 0,
              transition: 'opacity 1s ease-in-out',
              zIndex: index === currentSlide ? 10 : 0,
            }}
          />
        ))}
      </div>

      {/* Left/Right Arrows (Hidden on Mobile, phones use swipe/auto) */}
      <button
        onClick={prevSlide}
        className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-white/70 border-none rounded-full w-10 h-10 text-xl cursor-pointer items-center justify-center hover:bg-white transition-colors"
      >
        〈
      </button>
      <button
        onClick={nextSlide}
        className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-white/70 border-none rounded-full w-10 h-10 text-xl cursor-pointer items-center justify-center hover:bg-white transition-colors"
      >
        〉
      </button>

      {/* Dot indicators */}
      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '6px',
          zIndex: 20,
        }}
      >
        {slides.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === currentSlide ? '24px' : '8px', // Stretches the active dot
              height: '8px',
              borderRadius: '999px',
              backgroundColor: i === currentSlide ? 'white' : 'rgba(255,255,255,0.5)',
              transition: 'all 0.3s ease', // Smooth dot stretching animation
            }}
          />
        ))}
      </div>
    </section>
  );
}
