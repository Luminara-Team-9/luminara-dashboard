'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PerformanceApiResponse } from '@/shared/lib/types';

interface PerformanceDataContextValue {
  data: PerformanceApiResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const PerformanceDataContext = createContext<PerformanceDataContextValue | null>(null);

export function PerformanceDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<PerformanceApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/performance', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`API 오류: ${response.status}`);

      const payload = await response.json() as PerformanceApiResponse;
      setData(payload);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    void load();

    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

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
