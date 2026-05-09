export function DualPromoBanners() {
  const banners = [
    {
      src: "https://contents.mediadecathlon.com/s1390233/k$46211c2a33e2f094a552fa72eea59388/defaut.jpg?format=auto",
      alt: "Clear Vision",
      title: "Clear Vision",
      subtitle: "자외선 차단 고성능 선글라스로, 스타일리시하게, 모자까지",
      href: "/c/sunglasses",
    },
    {
      src: "https://contents.mediadecathlon.com/s1404455/k$feda547d1b687573f7da1977f768b6cc/defaut.jpg?format=auto",
      alt: "Ready for the Sun",
      title: "Ready for the Sun",
      subtitle: "자외선 차단, 스타일리시하게, 모자까지",
      href: "/c/running-cap",
    },
  ];

  return (
    <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", marginBottom: "8px" }}>
      {banners.map((banner) => (
        <a key={banner.href} href={banner.href} style={{ textDecoration: "none", position: "relative", display: "block" }}>
          <img
            src={banner.src}
            alt={banner.alt}
            width={1440}
            height={760}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
          <div style={{
            position: "absolute", bottom: "24px", left: "24px",
            color: "white",
          }}>
            <h3 style={{ fontSize: "20px", fontWeight: 900, marginBottom: "4px" }}>{banner.title}</h3>
            <p style={{ fontSize: "13px", opacity: 0.9 }}>{banner.subtitle}</p>
          </div>
        </a>
      ))}
    </section>
  );
}
