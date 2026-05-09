import type { Product } from '@/entities/product/model/types';

export interface DetailedProduct extends Product {
  brand?: string;
  colors?: string[];
  gender?: string;
  sizes?: string[];
  productType?: string;
}

export const runningProducts: DetailedProduct[] = [
  {
    id: '8960456',
    name: '남성 5인치 러닝 투인원 쇼츠 런 500 KIPRUN',
    price: 39900,
    imageUrl: 'https://contents.mediadecathlon.com/p3013863/sq/k$7b92cd3ac459dfab9763e4bc81d3981b/%EB%82%A8%EC%84%B1-5%EC%9D%B8%EC%B9%98-%EB%9F%AC%EB%8B%9D-%ED%88%AC%EC%9D%B8%EC%9B%90-%EC%87%BC%EC%B8%A0-%EB%9F%B0-500-kiprun-8960456.jpg?f=480x480&format=auto',
    category: '러닝',
    rating: 4.8,
    brand: 'KIPRUN',
    colors: ['블랙', '그레이'],
    gender: '남성용',
    sizes: ['M', 'L', 'XL'],
    productType: '반바지'
  },
  {
    id: '8861547',
    name: '남성 러닝 반팔 티 런 드라이 500 KIPRUN',
    price: 24900,
    imageUrl: 'https://contents.mediadecathlon.com/p2893372/sq/k$c24e116895b526b86dd2be3edd16b31c/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-500-kiprun-8861547.jpg?f=480x480&format=auto',
    category: '러닝',
    rating: 4.8,
    brand: 'KIPRUN',
    colors: ['블루', '화이트'],
    gender: '남성용',
    sizes: ['S', 'M', 'L', 'XL'],
    productType: '반소매 티셔츠'
  },
  {
    id: '8810971',
    name: '러닝 얇은 중목 양말 2켤레 파인 런 500 KIPRUN',
    price: 7900,
    imageUrl: 'https://contents.mediadecathlon.com/p3005201/sq/k$c00c197e3ba329d8521e4f49ba80fd82/%EB%9F%AC%EB%8B%9D-%EC%96%87%EC%9D%80-%EC%A4%91%EB%AA%A9-%EC%96%91%EB%A7%90-2%EC%BC%A4%EB%A0%88-%ED%8C%8C%EC%9D%B8-%EB%9F%B0-500-kiprun-8810971.jpg?f=480x480&format=auto',
    category: '러닝',
    rating: 4.8,
    brand: 'KIPRUN',
    colors: ['화이트', '블랙'],
    gender: '공용',
    sizes: ['S', 'M', 'L'],
    productType: '양말'
  },
  {
    id: '8817239',
    name: '여성 러닝 윈드 자켓 런 100 KIPRUN',
    price: 19900,
    originalPrice: 23900,
    imageUrl: 'https://contents.mediadecathlon.com/p2516892/sq/k$d1ee673b7d4ee48bd483f4cc963e553f/%EC%97%AC%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EC%9C%88%EB%93%9C-%EC%9E%90%EC%BC%93-%EB%9F%B0-100-kiprun-8817239.jpg?f=480x480&format=auto',
    category: '러닝',
    rating: 4.8,
    badge: 'sale',
    brand: 'KIPRUN',
    colors: ['핑크', '화이트'],
    gender: '여성용',
    sizes: ['S', 'M', 'L'],
    productType: '자켓'
  },
  {
    id: '8553338',
    name: '여성 4인치 러닝 쇼츠 런 드라이 100 KALENJI',
    price: 9900,
    imageUrl: 'https://contents.mediadecathlon.com/p2924625/sq/k$075f676a46105380a29b78ea3e357788/%EC%97%AC%EC%84%B1-4%EC%9D%B8%EC%B9%98-%EB%9F%AC%EB%8B%9D-%EC%87%BC%EC%B8%A0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-kalenji-8553338.jpg?f=480x480&format=auto',
    category: '러닝',
    rating: 4.8,
    brand: 'KALENJI',
    colors: ['블랙'],
    gender: '여성용',
    sizes: ['S', 'M'],
    productType: '반바지'
  },
  {
    id: '8826305',
    name: '하이킹 경량 백팩 22L MH500 라이트 QUECHUA',
    price: 79900,
    imageUrl: 'https://contents.mediadecathlon.com/p2612825/sq/k$73d99f4c09b202821cc9cc7162090a9b/%ED%95%98%EC%9D%B4%ED%82%B9-%EA%B2%BD%EB%9F%89-%EB%B0%B1%ED%8C%A9-22l-mh500-%EB%9D%BC%EC%9D%B4%ED%8A%B8-quechua-8826305.jpg?f=480x480&format=auto',
    category: '등산',
    rating: 4.8,
    badge: 'best',
    brand: 'QUECHUA',
    colors: ['그레이', '블루'],
    gender: '공용',
    sizes: ['Free'],
    productType: '배낭 / 백팩'
  },
  {
    id: '8487923',
    name: '남성 하프집 러닝 긴팔 티 런 웜 100 KALENJI',
    price: 19900,
    imageUrl: 'https://contents.mediadecathlon.com/p2607111/sq/k$ffa7f4654c9c174bcdf14cce22b20aa4/%EB%82%A8%EC%84%B1-%ED%95%98%ED%94%84%EC%A7%91-%EB%9F%AC%EB%8B%9D-%EA%B8%B4%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EC%9B%9C-100-kalenji-8487923.jpg?f=480x480&format=auto',
    category: '러닝',
    rating: 4.8,
    brand: 'KALENJI',
    colors: ['블랙', '레드'],
    gender: '남성용',
    sizes: ['M', 'L', 'XL', '2XL'],
    productType: '긴소매 티셔츠'
  },
  {
    id: '8588345',
    name: '남성 6인치 러닝 쇼츠 컴포트 500 KIPRUN',
    price: 29900,
    imageUrl: 'https://contents.mediadecathlon.com/p2600838/sq/k$fd7f3cc2db36e1673da8a650c812e5e2/%EB%82%A8%EC%84%B1-6%EC%9D%B8%EC%B9%98-%EB%9F%AC%EB%8B%9D-%EC%87%BC%EC%B8%A0-%EC%BB%B4%ED%8F%AC%ED%8A%B8-500-%EB%B8%8C%EB%A6%AC%ED%94%84-%EB%82%B4%EC%9E%A5-kiprun-8588345.jpg?f=480x480&format=auto',
    category: '러닝',
    rating: 4.8,
    brand: 'KIPRUN',
    colors: ['블랙'],
    gender: '남성용',
    sizes: ['L', 'XL', '2XL'],
    productType: '반바지'
  },
  {
    id: '8488034',
    name: '남성 러닝 반팔 티 런 드라이 100 DECATHLON',
    price: 5900,
    originalPrice: 9900,
    imageUrl: 'https://contents.mediadecathlon.com/p2924641/sq/k$67d6b1e1b55aa3217970880ea31408c6/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%98%ED%8C%94-%ED%8B%B0-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-decathlon-8488034.jpg?f=480x480&format=auto',
    category: '러닝',
    rating: 4.7,
    badge: 'sale',
    brand: 'DECATHLON',
    colors: ['블루', '그레이'],
    gender: '남성용',
    sizes: ['M', 'L'],
    productType: '반소매 티셔츠'
  },
  {
    id: '8928516',
    name: '남성 러닝 심리스 긴팔 티 런 500 KIPRUN',
    price: 9900,
    originalPrice: 34900,
    imageUrl: 'https://contents.mediadecathlon.com/p2906961/sq/k$5687e4d5c5b921c3f9b9e6ed8e421335/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EC%8B%AC%EB%A6%AC%EC%8A%A4-%EA%B8%B4%ED%8C%94-%ED%8B%B0-%EB%9F%B0-500-kiprun-8928516.jpg?f=480x480&format=auto',
    category: '러닝',
    rating: 4.8,
    badge: 'sale',
    brand: 'KIPRUN',
    colors: ['레드', '블랙'],
    gender: '남성용',
    sizes: ['S', 'M', 'L'],
    productType: '긴소매 티셔츠'
  }
];

export const essentialProducts = [
  {
    id: '8553338',
    name: '남성 러닝 반바지 런 드라이 플러스',
    price: 24000,
    imageUrl: 'https://contents.mediadecathlon.com/p2709170/sq/k$ede7dcf3709d56fd4d946888f661d919/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%94%EC%A7%80-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-kiprun-8882067.jpg?f=480x480&format=auto',
    rating: 4.8,
  },
  {
    id: '8605051',
    name: '남성 러닝 마라톤 레이싱 싱글렛 킵런',
    price: 34000,
    imageUrl: 'https://contents.mediadecathlon.com/p2709170/sq/k$ede7dcf3709d56fd4d946888f661d919/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%94%EC%A7%80-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-kiprun-8882067.jpg?f=480x480&format=auto',
    rating: 4.8,
  },
  {
    id: '8559092',
    name: '남성 러닝 마라톤 쇼츠 스플릿 킵런',
    price: 39000,
    imageUrl: 'https://contents.mediadecathlon.com/p2709170/sq/k$ede7dcf3709d56fd4d946888f661d919/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%94%EC%A7%80-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-kiprun-8882067.jpg?f=480x480&format=auto',
    rating: 4.7,
  },
  {
    id: '8736129',
    name: '남성 러닝 통기성 티셔츠 런 드라이 플러스',
    price: 19000,
    imageUrl: 'https://contents.mediadecathlon.com/p2709170/sq/k$ede7dcf3709d56fd4d946888f661d919/%EB%82%A8%EC%84%B1-%EB%9F%AC%EB%8B%9D-%EB%B0%94%EC%A7%80-%EB%9F%B0-%EB%93%9C%EB%9D%BC%EC%9D%B4-100-kiprun-8882067.jpg?f=480x480&format=auto',
    rating: 4.8,
  },
];
