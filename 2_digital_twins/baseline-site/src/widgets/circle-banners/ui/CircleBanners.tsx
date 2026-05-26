import Link from 'next/link';

export function CircleBanners() {
  const circles = [
    {
      label: '첫 구매라면?',
      href: '/category/first-choice',
      imageUrl:
        'https://contents.mediadecathlon.com/s1383834/k$71660e59bdb5fb9544df6d90996373cb/defaut.jpg?format=auto',
    },
    {
      label: '신제품',
      href: '/category/ss-new.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1370171/k$5abd20d860341cef8cea88f9a412b1c1/defaut.jpg?format=auto',
    },
    {
      label: '러닝 베스트셀러',
      href: '/category/running-bestseller.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1389586/k$7a7635e863bf3da0d384afdb99750f35/defaut.jpg?format=auto',
    },
    {
      label: '하이킹 베스트셀러',
      href: '/category/hiking-bestseller.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1389588/k$9a772b563186151a1f5448d92e20ebed/defaut.jpg?format=auto',
    },
    {
      label: '러닝화',
      href: '/category/running-shoes.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1376611/k$d779e91d765aaf6751acc209642ca5c0/defaut.jpg?format=auto',
    },
    {
      label: '바람막이',
      href: '/category/windbreaker.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1378141/k$1edbc6121c2a8df0ad1e45df165efe68/defaut.jpg?format=auto',
    },
    {
      label: '러닝 싱글렛',
      href: '/category/running-singlet.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1391974/k$888c6e9e0a0288e67cc368a611c36d21/defaut.jpg?format=auto',
    },
    {
      label: '러닝 쇼츠',
      href: '/category/running-shorts.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1378142/k$45ed7e876b4607707e1c762dd827987d/defaut.jpg?format=auto',
    },
    {
      label: '선글라스',
      href: '/category/sunglasses.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1378145/k$6ff63e898ba5da7975afb0ad10832719/defaut.jpg?format=auto',
    },
    {
      label: '하이킹 백팩',
      href: '/category/hiking-backpack.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1376613/k$d9490e3848c32548eb58f456caa9f2a3/defaut.jpg?format=auto',
    },
    {
      label: '러닝 모자',
      href: '/category/running-cap.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1378140/k$d912e92979268f66a4aa9a2d21fb9827/defaut.jpg?format=auto',
    },
    {
      label: '트레일 러닝',
      href: '/category/trail-running.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1389587/k$fbca100ef078de7b6c5695985ab0a00d/defaut.jpg?format=auto',
    },
    {
      label: '러닝 반팔',
      href: '/category/running-tshirt.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1378147/k$cfa96010819e762782ab77f6515ecb66/defaut.jpg?format=auto',
    },
    {
      label: '러닝 양말',
      href: '/category/running-socks.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1376612/k$7c32e3c1a459cb66a55b5dcf38aa9067/defaut.jpg?format=auto',
    },
    {
      label: '하이킹 자켓',
      href: '/category/hiking-jacket.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1378139/k$3512ff9cfc4dd92fda473c2e69520537/defaut.jpg?format=auto',
    },
    {
      label: '하이킹 팬츠',
      href: '/category/hiking-pants.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1378146/k$7427faea76ecfc35192270b7a46f526d/defaut.jpg?format=auto',
    },
    {
      label: '하이킹 액세서리',
      href: '/category/hiking-accessory.html',
      imageUrl:
        'https://contents.mediadecathlon.com/s1313815/k$d43aaea41c07c63d9fa06e540e6c270a/defaut.jpg?format=auto',
    },
  ];

  return (
    <section className="bg-white py-4 border-b border-gray-100">
      <div className="max-w-[1200px] mx-auto px-4">
        {/* The [&::-webkit-scrollbar]:hidden class completely kills the scrollbar on mobile browsers */}
        <div className="flex overflow-x-auto gap-2 pb-2 snap-x snap-mandatory scroll-smooth scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {circles.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex-none snap-start flex flex-col items-center gap-1.5 no-underline shrink-0 w-[80px] p-1 group"
            >
              <div className="w-14 h-14 rounded-full overflow-hidden bg-[#1e3a5f] group-hover:ring-2 group-hover:ring-[#0055A4] transition-all">
                <img
                  src={item.imageUrl}
                  alt={item.label}
                  width={56}
                  height={56}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <span
                style={{
                  fontSize: '10px',
                  color: '#374151',
                  textAlign: 'center',
                  lineHeight: '1.3',
                  wordBreak: 'keep-all',
                }}
              >
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
