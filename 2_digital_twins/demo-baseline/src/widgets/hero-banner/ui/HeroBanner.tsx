'use client';

import { useState, useEffect } from 'react';

export function HeroBanner() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      src: 'https://contents.mediadecathlon.com/s1414033/k$de3973b0210cd72f5726758a129a021a/defaut.jpg?format=auto',
      alt: '2026.05 리프레시 프로모션',
    },
    {
      src: 'https://contents.mediadecathlon.com/s1408511/k$cc7d056986b685b3aec07c224beadb8b/defaut.jpg?format=auto',
      alt: 'Real Recognizes Real',
    },
    {
      src: 'https://contents.mediadecathlon.com/s1403907/k$c53c54d0a6e48c5b8074afbcd034bdc5/defaut.jpg?format=auto',
      alt: 'Power in Every Pulse',
    },
    {
      src: 'https://contents.mediadecathlon.com/s1413738/k$7831092b80905e8113e996e878d4e9b0/defaut.jpg?format=auto',
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
    <section style={{ width: '100%', position: 'relative', backgroundColor: '#e5e7eb' }}>
      {/* Real aspect ratio from scraped HTML: 1024 / 286 */}
      <div
        style={{
          aspectRatio: '1024 / 286',
          width: '100%',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {slides.map((slide, index) => (
          <img
            key={index}
            src={slide.src}
            alt={slide.alt}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              opacity: index === currentSlide ? 1 : 0, // Shows 1 if active, 0 if not
              transition: 'opacity 1s ease-in-out', // Smooth fade effect
              zIndex: index === currentSlide ? 10 : 0, // Brings active image to the front
            }}
          />
        ))}
      </div>
      {/* Left/Right Arrows */}
      <button
        onClick={prevSlide}
        style={{
          position: 'absolute',
          left: '16px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 20,
          backgroundColor: 'rgba(255,255,255,0.7)',
          border: 'none',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          fontSize: '20px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        〈
      </button>
      <button
        onClick={nextSlide}
        style={{
          position: 'absolute',
          right: '16px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 20,
          backgroundColor: 'rgba(255,255,255,0.7)',
          border: 'none',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          fontSize: '20px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
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
