export function SportCategoryBanners() {
  const banners = [
    {
      src: "https://contents.mediadecathlon.com/s1410373/k$bb95f236753372a6651daffd111dd563/defaut.jpg?format=auto",
      alt: "Cycling",
      label: "Cycling",
      href: "/c/cycling",
    },
    {
      src: "https://contents.mediadecathlon.com/s1370505/k$f57b70ee41c217a4d1a0b59cd6e3be0b/defaut.jpg?format=auto",
      alt: "Tennis",
      label: "TENNIS",
      href: "/c/tennis",
    },
    {
      src: "https://contents.mediadecathlon.com/s1342493/k$03b9765863748cca8689e42e9b41b90c/defaut.jpg?format=auto",
      alt: "Training",
      label: "TRA...",
      href: "/c/training",
    },
  ];

  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px", marginBottom: "8px" }}>
      {banners.map((banner) => (
        <a key={banner.href} href={banner.href} style={{ textDecoration: "none", position: "relative", display: "block" }}>
          <img
            src={banner.src}
            alt={banner.alt}
            width={960}
            height={500}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
          <div style={{
            position: "absolute", bottom: "16px", left: "16px",
          }}>
            <span style={{
              backgroundColor: "white",
              color: "#111827",
              fontWeight: 900,
              fontSize: "14px",
              padding: "6px 16px",
              borderRadius: "999px",
            }}>
              더 보러가기
            </span>
          </div>
        </a>
      ))}
    </section>
  );
}
