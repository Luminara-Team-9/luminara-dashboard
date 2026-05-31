export function PromoBanners() {
  return (
    <section style={{ width: "100%", marginBottom: "8px" }}>
      {/* Running Essential - using exact 1024:286 aspect ratio from real site */}
      <a href="/s/running-essentials" style={{ display: "block", textDecoration: "none" }}>
        <div style={{ aspectRatio: "1024 / 286", width: "100%", position: "relative", overflow: "hidden", marginBottom: "4px" }}>
          <img
            src="https://contents.mediadecathlon.com/s1406071/k$94027af63aa2bdabdce68bd86545c2f4/defaut.jpg?format=webp"
            alt="Running Essential"
            loading='eager'
            fetchpriority='high'
            decoding='async'
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      </a>
    </section>
  );
}
