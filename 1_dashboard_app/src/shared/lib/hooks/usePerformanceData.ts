import { usePerformanceContext } from '@/app/providers/PerformanceDataProvider';

export function usePerformanceData() {
  return usePerformanceContext();
}
