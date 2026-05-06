import { Button } from '@/shared/ui';

export function HeroBanner() {
  return (
    <section className="relative bg-blue-600 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 py-20 flex items-center justify-between">
        {/* Text content */}
        <div className="text-white max-w-lg">
          <p className="text-blue-200 text-sm font-medium uppercase tracking-widest mb-3">
            2026 Spring Collection
          </p>
          <h1 className="text-5xl font-black leading-tight mb-4">
            스포츠의
            <br />
            모든 것을
            <br />
            데카트론에서
          </h1>
          <p className="text-blue-100 text-lg mb-8">
            러닝부터 캠핑까지, 최고의 스포츠 장비를 합리적인 가격으로 만나보세요.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" size="lg">
              지금 쇼핑하기
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="border-white text-white hover:bg-white hover:text-blue-600"
            >
              카탈로그 보기
            </Button>
          </div>
        </div>

        {/* Decorative circle */}
        <div className="hidden lg:block w-96 h-96 rounded-full bg-blue-500 opacity-50 absolute -right-20 -top-20" />
        <div className="hidden lg:block w-64 h-64 rounded-full bg-blue-400 opacity-30 absolute right-32 bottom-0" />
      </div>
    </section>
  );
}
