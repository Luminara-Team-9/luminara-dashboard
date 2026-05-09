export type Product = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  imageUrl: string;
  category: string;
  badge?: 'new' | 'sale' | 'best';
  rating?: number;
};
