import Link from 'next/link';

export function TopSports() {
  const sports = [
    {
      label: '러닝',
      href: '/c/running',
      imageUrl:
        'https://contents.mediadecathlon.com/p3040527/k$26f0c5e298acb707523e82a7d4c03403/2000x2000/3742pt4813/7485xcr7485/DEB%20COURT%20RUN%20500%20F%20RESPI%20JAUNE%20B02B%20PE26.webp',
    },
    {
      label: '등산',
      href: '/c/hiking',
      imageUrl:
        'https://contents.mediadecathlon.com/p2609665/k$cad3fa7c6ec7d258d400157a364dbdee/3444pt2464/3777xcr3777/QUECHUA%20T%20SHIRT%20MH100%20H%20GRIS%20PE24.webp',
    },
    {
      label: '필라테스/피트니스',
      href: '/c/fitness',
      imageUrl:
        'https://contents.mediadecathlon.com/p2410122/k$a05a4fbc44003bf8030de534a59f962b/4386pt2987/3996xcr3996/DOMYOS%20T-SHIRT%20500%20NOIR.jpg?format=auto',
    },
    {
      label: '캠핑',
      href: '/c/camping',
      imageUrl:
        'https://contents.mediadecathlon.com/p1832853/k$60270afb2cfe59adcc78e9b440a1f51a/2127pt2312/1982xcr1982/MOUNTAIN%20HIKING%20CAMP%20PE20.webp',
    },
    {
      label: '킥보드/인라인',
      href: '/c/scooter',
      imageUrl:
        'https://contents.mediadecathlon.com/p2735674/k$6486c1b1b65cda1643e690640f2a18af/1000pt1674/2000xcr2000/OXELO%20MOVE%20900%20GRISE.webp',
    },
    {
      label: '수영/스노클링',
      href: '/c/swimming',
      imageUrl:
        'https://contents.mediadecathlon.com/p2662019/k$45d4bfac2bc1e3828a297fc7945f5a9c/2656pt1650/2817xcr2817/SUBEA%20KIT%20MT%20DRY%20TOP%20VERT%20SANS%20SAC%20PE24%20AH24.webp',
    },
  ];

  return (
    <section style={{ backgroundColor: 'white', padding: '24px 0', marginBottom: '8px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 16px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#111827', marginBottom: '16px' }}>
          Top Sports
        </h2>
        <div
          className="flex overflow-x-auto lg:grid lg:grid-cols-6 gap-4 pb-4 snap-x"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {sports.map((sport) => (
            <Link
              key={sport.href}
              href={sport.href}
              className="flex-none w-[160px] lg:w-auto snap-start group"
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <div style={{ overflow: 'hidden', borderRadius: '8px', marginBottom: '12px' }}>
                <img
                  src={sport.imageUrl}
                  alt={sport.label}
                  className="w-full h-[200px] md:h-[240px] object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <p
                style={{ textAlign: 'center', color: '#111827', fontWeight: 700, fontSize: '15px' }}
              >
                {sport.label}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
