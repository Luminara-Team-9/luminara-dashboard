'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PerformanceApiResponse } from '@/shared/lib/types';

const DEFAULT_LIVE_REFRESH_INTERVAL_MS = 5_000;
const DEFAULT_FULL_REFRESH_INTERVAL_MS = 60_000;

function getIntervalMs(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function getLiveRefreshIntervalMs(): number {
  return getIntervalMs("NEXT_PUBLIC_DASHBOARD_LIVE_REFRESH_MS", getIntervalMs("NEXT_PUBLIC_DASHBOARD_REFRESH_MS", DEFAULT_LIVE_REFRESH_INTERVAL_MS));
}

function getFullRefreshIntervalMs(): number {
  return getIntervalMs("NEXT_PUBLIC_DASHBOARD_FULL_REFRESH_MS", DEFAULT_FULL_REFRESH_INTERVAL_MS);
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
  const dataRef = useRef<PerformanceApiResponse | null>(null);

  const load = useCallback(async (options?: { background?: boolean; liveOnly?: boolean }) => {
    const isBackground = Boolean(options?.background);
    const isLiveOnly = Boolean(options?.liveOnly);

    if (isLiveOnly && !dataRef.current) return;

    if (abortRef.current) {
      if (isBackground) return;
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    if (!isBackground) {
      if (!dataRef.current) setLoading(true);
      setError(null);
    }

    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (isLiveOnly) params.set("mode", "live");

      const response = await fetch("/api/performance?" + params.toString(), {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("API 오류: " + response.status);

      const payload = await response.json() as PerformanceApiResponse;
      dataRef.current = payload;
      setData(payload);
      setError(null);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      if (!isBackground && !dataRef.current) {
        setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const liveRefreshIntervalMs = getLiveRefreshIntervalMs();
    const fullRefreshIntervalMs = getFullRefreshIntervalMs();
    let stopped = false;
    let liveTimer: number | undefined;
    let fullTimer: number | undefined;

    const scheduleLiveRefresh = () => {
      if (stopped || liveRefreshIntervalMs <= 0) return;

      liveTimer = window.setTimeout(() => {
        void load({ background: true, liveOnly: true }).finally(scheduleLiveRefresh);
      }, liveRefreshIntervalMs);
    };

    const scheduleFullRefresh = () => {
      if (stopped || fullRefreshIntervalMs <= 0) return;

      fullTimer = window.setTimeout(() => {
        void load({ background: true }).finally(scheduleFullRefresh);
      }, fullRefreshIntervalMs);
    };

    void load().finally(() => {
      scheduleLiveRefresh();
      scheduleFullRefresh();
    });

    return () => {
      stopped = true;
      if (liveTimer !== undefined) window.clearTimeout(liveTimer);
      if (fullTimer !== undefined) window.clearTimeout(fullTimer);
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
