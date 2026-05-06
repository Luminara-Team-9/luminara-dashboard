export function TopSports() {
  const sports = [
    { label: "러닝", href: "/c/running", imageUrl: "https://contents.mediadecathlon.com/s1389586/k$7a7635e863bf3da0d384afdb99750f35/defaut.jpg?format=auto" },
    { label: "등산", href: "/c/hiking", imageUrl: "https://contents.mediadecathlon.com/s1389588/k$9a772b563186151a1f5448d92e20ebed/defaut.jpg?format=auto" },
    { label: "필라테스/피트니스", href: "/c/fitness", imageUrl: "https://contents.mediadecathlon.com/s1391974/k$888c6e9e0a0288e67cc368a611c36d21/defaut.jpg?format=auto" },
    { label: "캠핑", href: "/c/camping", imageUrl: "https://contents.mediadecathlon.com/s1376613/k$d9490e3848c32548eb58f456caa9f2a3/defaut.jpg?format=auto" },
    { label: "킥보드/인라인", href: "/c/scooter", imageUrl: "https://contents.mediadecathlon.com/s1378142/k$45ed7e876b4607707e1c762dd827987d/defaut.jpg?format=auto" },
  ];

  return (
    <section style={{ backgroundColor: "white", padding: "24px 0", marginBottom: "8px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 16px" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 900, color: "#111827", marginBottom: "16px" }}>Top Sports</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px" }}>
          {sports.map((sport) => (
            <a
              key={sport.href}
              href={sport.href}
              style={{ textDecoration: "none", position: "relative", borderRadius: "8px", overflow: "hidden", display: "block" }}
            >
              <img
                src={sport.imageUrl}
                alt={sport.label}
                width={300}
                height={200}
                style={{ width: "100%", height: "160px", objectFit: "cover", display: "block" }}
              />
              <div style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)",
                display: "flex",
                alignItems: "flex-end",
                padding: "12px",
              }}>
                <span style={{ color: "white", fontWeight: 700, fontSize: "14px" }}>{sport.label}</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
