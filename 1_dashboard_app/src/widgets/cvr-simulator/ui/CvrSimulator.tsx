'use client';

import { useState, useMemo, useEffect } from 'react';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { calcCvrBreakdown, calcRevenueImpact, WPO_COEFFICIENTS } from '@/shared/lib/cvr';
import { Skeleton } from '@/shared/ui';
import styles from './CvrSimulator.module.css';

const METRIC_TARGETS = { lcp: 2.5, inp: 200, cls: 0.1 };

// ── 슬라이더 행 ───────────────────────────────────────────────
function SliderRow({ label, value, min, max, step, unit, target, onChange }: {
  label: string; value: number; min: number; max: number;
  step: number; unit: string; target: number; onChange: (v: number) => void;
}) {
  const pct     = ((value - min) / (max - min)) * 100;
  const atTarget = value <= target;

  return (
    <div className={styles.slider_row}>
      <div className={styles.slider_label_row}>
        <span className={styles.slider_label}>{label}</span>
        <span className={styles.slider_value} style={{ color: atTarget ? '#10b981' : '#f59e0b' }}>
          {value}{unit}
          {atTarget && <span className={styles.target_badge}>목표 달성</span>}
        </span>
      </div>
      <div className={styles.slider_track}>
        <div className={styles.slider_fill} style={{ width: `${pct}%` }} />
        <input
          type="range"
          className={styles.slider}
          min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
        />
        <div
          className={styles.target_line}
          style={{ left: `${((target - min) / (max - min)) * 100}%` }}
          title={`목표: ${target}${unit}`}
        />
      </div>
      <div className={styles.slider_range}>
        <span>{min}{unit}</span>
        <span className={styles.target_hint}>목표 {target}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

// ── 기여 분해 바 ─────────────────────────────────────────────
function BreakdownBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className={styles.breakdown_row}>
      <span className={styles.breakdown_label}>{label}</span>
      <div className={styles.breakdown_track}>
        <div className={styles.breakdown_fill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.breakdown_val}>+{value}%</span>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export function CvrSimulator() {
  const { data, loading, error } = usePerformanceData();

  const baseTarget = data?.benchmarks.find(b => b.isTarget);

  const [lcp, setLcp] = useState(3.8);
  const [inp, setInp] = useState(285);
  const [cls, setCls] = useState(0.08);
  const [revenue, setRevenue] = useState(3000);  // 억원 단위 입력

  // 데이터 로드 후 슬라이더 초기값 동기화
  useEffect(() => {
    if (baseTarget) {
      setLcp(baseTarget.metrics.lcp.value);
      setInp(baseTarget.metrics.inp.value);
      setCls(baseTarget.metrics.cls.value);
    }
  }, [baseTarget]);

  const breakdown = useMemo(() => calcCvrBreakdown({
    lcpCurrent: lcp, lcpTarget: METRIC_TARGETS.lcp,
    inpCurrent: inp, inpTarget: METRIC_TARGETS.inp,
    clsCurrent: cls, clsTarget: METRIC_TARGETS.cls,
  }), [lcp, inp, cls]);

  const annualRevenue = revenue * 100_000_000;
  const revenueImpact = calcRevenueImpact(breakdown.total, annualRevenue);
  const revenueB      = (revenueImpact / 100_000_000).toFixed(1);

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) {
    return (
      <section className={styles.wrapper}>
        <Skeleton width="180px" height="18px" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 0' }}>
          {[0,1,2].map(i => <Skeleton key={i} width="100%" height="60px" radius="8px" />)}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.header_left}>
          <h2 className={styles.title}>CVR 시뮬레이터</h2>
          <span className={styles.subtitle}>목표 달성 시 예상 전환율 향상</span>
        </div>
        <a
          href="https://wpostats.com"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.source_link}
        >
          WPO Stats 기반 추정 ↗
        </a>
      </div>

      <div className={styles.body}>
        {/* ── 슬라이더 영역 ── */}
        <div className={styles.sliders}>
          <SliderRow
            label="LCP" value={lcp} min={1.0} max={8.0} step={0.1} unit="s"
            target={METRIC_TARGETS.lcp} onChange={setLcp}
          />
          <SliderRow
            label="INP" value={inp} min={50} max={600} step={5} unit="ms"
            target={METRIC_TARGETS.inp} onChange={setInp}
          />
          <SliderRow
            label="CLS" value={cls} min={0} max={0.5} step={0.01} unit=""
            target={METRIC_TARGETS.cls} onChange={setCls}
          />

          {/* 연 매출 입력 */}
          <div className={styles.revenue_row}>
            <label className={styles.revenue_label}>
              연 매출 기준 (억원)
              <span className={styles.revenue_hint}>* 실제 매출 입력 시 정확도 향상</span>
            </label>
            <div className={styles.revenue_input_wrap}>
              <input
                type="number"
                className={styles.revenue_input}
                value={revenue}
                min={100}
                max={100000}
                step={100}
                onChange={e => setRevenue(Math.max(100, Number(e.target.value)))}
              />
              <span className={styles.revenue_unit}>억</span>
            </div>
          </div>
        </div>

        {/* ── 결과 패널 ── */}
        <div className={styles.result_panel}>
          <div className={styles.result_main}>
            <span className={styles.result_label}>예상 CVR 향상</span>
            <span className={styles.result_value}>+{breakdown.total}%</span>
          </div>
          <div className={styles.result_revenue}>
            <span className={styles.result_sub}>연간 추가 매출 예측</span>
            <span className={styles.result_revenue_val}>+₩{revenueB}억</span>
          </div>

          <div className={styles.breakdown}>
            <p className={styles.breakdown_title}>지표별 기여</p>
            <BreakdownBar label={`LCP (${WPO_COEFFICIENTS.LCP_PER_SECOND}%/s)`}   value={breakdown.lcp} total={breakdown.total} />
            <BreakdownBar label={`INP (${WPO_COEFFICIENTS.INP_PER_100MS}%/100ms)`} value={breakdown.inp} total={breakdown.total} />
            <BreakdownBar label={`CLS (${WPO_COEFFICIENTS.CLS_PER_TENTH}%/0.1)`}   value={breakdown.cls} total={breakdown.total} />
          </div>

          <p className={styles.disclaimer}>
            Deloitte/Google 2020 · Portent 2019 · Zalando 2018 케이스스터디 기반 보수적 추정.
            실제 수치는 사이트 특성에 따라 다를 수 있음.
          </p>
        </div>
      </div>
    </section>
  );
}
