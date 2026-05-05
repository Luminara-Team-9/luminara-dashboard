const categories = [
  { label: "러닝", emoji: "🏃", href: "/category/running", color: "bg-orange-50 hover:bg-orange-100" },
  { label: "수영", emoji: "🏊", href: "/category/swimming", color: "bg-blue-50 hover:bg-blue-100" },
  { label: "등산·트레킹", emoji: "🧗", href: "/category/hiking", color: "bg-green-50 hover:bg-green-100" },
  { label: "캠핑", emoji: "⛺", href: "/category/camping", color: "bg-yellow-50 hover:bg-yellow-100" },
  { label: "사이클", emoji: "🚴", href: "/category/cycling", color: "bg-red-50 hover:bg-red-100" },
  { label: "헬스·필라테스", emoji: "🏋️", href: "/category/fitness", color: "bg-purple-50 hover:bg-purple-100" },
  { label: "축구", emoji: "⚽", href: "/category/football", color: "bg-lime-50 hover:bg-lime-100" },
  { label: "요가", emoji: "🧘", href: "/category/yoga", color: "bg-pink-50 hover:bg-pink-100" },
];

export function CategoryGrid() {
  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      <h2 className="text-2xl font-black text-gray-900 mb-6">
        스포츠 카테고리
      </h2>
      <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
        {categories.map((cat) => (
          
            key={cat.href}
            href={cat.href}
            className={`${cat.color} rounded-xl p-4 flex flex-col items-center gap-2 transition-colors duration-200 cursor-pointer`}
          >
            <span className="text-3xl">{cat.emoji}</span>
            <span className="text-xs font-medium text-gray-700 text-center leading-tight">
              {cat.label}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}