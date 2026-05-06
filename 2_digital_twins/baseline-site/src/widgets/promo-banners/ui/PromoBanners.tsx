export function PromoBanners() {
  return (
    <section style={{ width: "100%", marginBottom: "8px" }}>
      {/* Running Essential - constrained height like real site */}
      <div style={{ width: "100%", marginBottom: "4px", overflow: "hidden" }}>
        <img
          src="https://contents.mediadecathlon.com/s1406071/k$94027af63aa2bdabdce68bd86545c2f4/defaut.jpg?format=auto"
          alt="Running Essential"
          width={2880}
          height={760}
          style={{ width: "100%", maxHeight: "400px", objectFit: "cover", objectPosition: "center", display: "block" }}
        />
      </div>
      {/* Power in Every Pulse - narrow */}
      <div style={{ width: "100%", overflow: "hidden", marginBottom: "4px" }}>
        <img
          src="https://contents.mediadecathlon.com/s1403907/k$c53c54d0a6e48c5b8074afbcd034bdc5/defaut.jpg?format=auto"
          alt="Power in Every Pulse"
          width={2880}
          height={760}
          style={{ width: "100%", maxHeight: "220px", objectFit: "cover", objectPosition: "center", display: "block" }}
        />
      </div>
    </section>
  );
}
