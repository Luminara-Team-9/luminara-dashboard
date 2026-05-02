'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { PerformanceApiResponse } from '@/shared/lib/types';

interface PerformanceDataContextValue {
  data: PerformanceApiResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const PerformanceDataContext = createContext<PerformanceDataContextValue | null>(null);

export function PerformanceDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData]       = useState<PerformanceApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
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
  }

  useEffect(() => { load(); }, []);

  return (
    <PerformanceDataContext.Provider value={{ data, loading, error, refetch: load }}>
      {children}
    </PerformanceDataContext.Provider>
  );
}

export function usePerformanceContext(): PerformanceDataContextValue {
  const ctx = useContext(PerformanceDataContext);
  if (!ctx) throw new Error('usePerformanceContext must be used within PerformanceDataProvider');
  return ctx;
}
