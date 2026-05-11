const KO_NUMBER = new Intl.NumberFormat('ko-KR');

export function formatInteger(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return KO_NUMBER.format(Math.round(value));
}

export function formatCompactCount(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  if (value >= 10000) return `${(value / 10000).toFixed(1)}만`;
  return KO_NUMBER.format(Math.round(value));
}

export function formatPercent(value: number | undefined | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(digits)}%`;
}

export function formatKrw(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
  if (value >= 10000) return `${(value / 10000).toFixed(0)}만`;
  return KO_NUMBER.format(Math.round(value));
}
