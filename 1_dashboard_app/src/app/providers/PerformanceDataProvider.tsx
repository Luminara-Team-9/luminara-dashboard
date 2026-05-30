'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PerformanceApiResponse } from '@/shared/lib/types';

const DEFAULT_REFRESH_INTERVAL_MS = 5_000;

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
  dateFrom: string;
  dateTo: string;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  refetch: () => void;
}

const PerformanceDataContext = createContext<PerformanceDataContextValue | null>(null);

export function PerformanceDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PerformanceApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (options?: { background?: boolean }) => {
    const isBackground = Boolean(options?.background);
    if (abortRef.current) {
      if (isBackground) return;
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    if (!isBackground) {
      setLoading(true);
      setError(null);
    }

    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      const response = await fetch(`/api/performance?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`API 오류: ${response.status}`);

      const payload = await response.json() as PerformanceApiResponse;
      setData(payload);
      setError(null);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      if (!isBackground) {
        setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const refreshIntervalMs = getRefreshIntervalMs();
    let stopped = false;
    let timer: number | undefined;

    const scheduleNext = () => {
      if (stopped || refreshIntervalMs <= 0) return;

      timer = window.setTimeout(() => {
        void load({ background: true }).finally(scheduleNext);
      }, refreshIntervalMs);
    };

    void load().finally(scheduleNext);

    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [load]);

  return (
    <PerformanceDataContext.Provider value={{ data, loading, error, dateFrom, dateTo, setDateFrom, setDateTo, refetch: load }}>
      {children}
    </PerformanceDataContext.Provider>
  );
}

export function usePerformanceContext(): PerformanceDataContextValue {
  const ctx = useContext(PerformanceDataContext);
  if (!ctx) throw new Error('usePerformanceContext must be used within PerformanceDataProvider');
  return ctx;
}
