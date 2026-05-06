export function HeroBanner() {
  const banners = [
    {
      src: "https://contents.mediadecathlon.com/s1414033/k$de3973b0210cd72f5726758a129a021a/defaut.jpg?format=auto",
      alt: "2026.05 리프레시 프로모션",
    },
    {
      src: "https://contents.mediadecathlon.com/s1408511/k$cc7d056986b685b3aec07c224beadb8b/defaut.jpg?format=auto",
      alt: "2026.04 Real Recognizes Real",
    },
    {
      src: "https://contents.mediadecathlon.com/s1403907/k$c53c54d0a6e48c5b8074afbcd034bdc5/defaut.jpg?format=auto",
      alt: "2026.04 Power in Every Pulse",
    },
    {
      src: "https://contents.mediadecathlon.com/s1413738/k$7831092b80905e8113e996e878d4e9b0/defaut.jpg?format=auto",
      alt: "2026.04 KIPSUMMIT MAX",
    },
  ];

  return (
    <section style={{ width: "100%", backgroundColor: "#e5e7eb", position: "relative" }}>
      <img
        src={banners[0].src}
        alt={banners[0].alt}
        width={2880}
        height={760}
        style={{ width: "100%", height: "auto", display: "block" }}
      />
      <div style={{
        position: "absolute",
        bottom: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: "6px",
      }}>
        {banners.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === 0 ? "24px" : "8px",
              height: "8px",
              borderRadius: "999px",
              backgroundColor: i === 0 ? "white" : "rgba(255,255,255,0.5)",
            }}
          />
        ))}
      </div>
    </section>
  );
}