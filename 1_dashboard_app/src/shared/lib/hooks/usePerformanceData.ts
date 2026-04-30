import { useEffect, useState } from 'react';
import type { PerformanceApiResponse } from '@/shared/lib/types';

export function usePerformanceData() {
  const [data, setData]       = useState<PerformanceApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/performance', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`API 오류: ${res.status}`);
        return res.json() as Promise<PerformanceApiResponse>;
      })
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
      })
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}
