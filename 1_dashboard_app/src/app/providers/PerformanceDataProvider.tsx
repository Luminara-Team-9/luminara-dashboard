'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PerformanceApiResponse } from '@/shared/lib/types';

const DEFAULT_REFRESH_INTERVAL_MS = 30_000;

function getRefreshIntervalMs(): number {
  const raw = process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_MS;
  if (!raw) return DEFAULT_REFRESH_INTERVAL_MS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_REFRESH_INTERVAL_MS;
  return parsed;
}

interface PerformanceDataContextValue {
  data: PerformanceApiResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const PerformanceDataContext = createContext<PerformanceDataContextValue | null>(null);

export function PerformanceDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PerformanceApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (options?: { background?: boolean }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!options?.background) setLoading(true);
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
    const refreshIntervalMs = getRefreshIntervalMs();

    if (refreshIntervalMs > 0) {
      const timer = window.setInterval(() => {
        void load({ background: true });
      }, refreshIntervalMs);

      return () => {
        window.clearInterval(timer);
        abortRef.current?.abort();
      };
    }

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
