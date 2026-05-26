export type Product = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  imageUrl: string; // Keep this for the ProductCard thumbnails
  images?: string[];
  category: string;
  badge?: 'new' | 'sale' | 'best';
  rating?: number;
  title: string;
  brand: string;
};
