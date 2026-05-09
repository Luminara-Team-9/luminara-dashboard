export function formatPrice(price: number, currency = '₩'): string {
  return `${currency}${price.toLocaleString('ko-KR')}`;
}
