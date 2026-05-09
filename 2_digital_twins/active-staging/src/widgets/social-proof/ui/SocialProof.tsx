export function SocialProof() {
  const posts = [
    { src: "https://contents.mediadecathlon.com/s1405136/k$f8a3fd75b6ef1b3195800a59165e79fb/defaut.jpg?format=auto", user: "@coco____snow" },
    { src: "https://contents.mediadecathlon.com/s1405139/k$27bd106d978c9dc9c19b2842d8dd649a/defaut.jpg?format=auto", user: "@wooo_jmin" },
    { src: "https://contents.mediadecathlon.com/s1405135/k$2787358b072b7cd16ce8935dd0cd5293/defaut.jpg?format=auto", user: "@hsh_91" },
    { src: "https://contents.mediadecathlon.com/s1405140/k$c70a5b556d5e6d746af0c916b0266054/defaut.jpg?format=auto", user: "@heihwi" },
    { src: "https://contents.mediadecathlon.com/s1405144/k$c97ce899431bb97bf1fe6e339b04c6a1/defaut.jpg?format=auto", user: "@lovely._.s00" },
    { src: "https://contents.mediadecathlon.com/s1405138/k$0cb2c3610994b7f02fb7d582127880c4/defaut.jpg?format=auto", user: "@nahyeonup" },
  ];

  return (
    <section style={{ backgroundColor: "white", padding: "32px 0", marginBottom: "8px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 16px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 900, marginBottom: "16px", color: "#111827" }}>
          #데카트론 커뮤니티
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px" }}>
          {posts.map((post) => (
            <div key={post.user} style={{ position: "relative", aspectRatio: "1", overflow: "hidden", borderRadius: "4px" }}>
              <img
                src={post.src}
                alt={post.user}
                width={300}
                height={300}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <div style={{
                position: "absolute", bottom: "8px", left: "8px",
                color: "white", fontSize: "11px", fontWeight: 600,
                textShadow: "0 1px 3px rgba(0,0,0,0.5)",
              }}>
                {post.user}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
