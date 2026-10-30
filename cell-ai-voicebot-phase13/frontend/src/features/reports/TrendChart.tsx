import { LineChart } from '@mui/x-charts/LineChart';

import type { Report } from '@/services/api/types';

import { formatMetric, metricLabel } from './labels';

/** Day series of one unit as lines (lazy-loaded — keeps charts out of the main bundle). */
export default function TrendChart({ series }: { series: Report['series'] }) {
  const unit = series[0]?.unit ?? 'count';
  const days = series[0]?.points.map((p) => p.day) ?? [];
  return (
    <LineChart
      height={280}
      xAxis={[{ scaleType: 'point', data: days.map((d) => d.slice(5)) }]}
      yAxis={[{ valueFormatter: (v: number) => formatMetric(v, unit), width: 72 }]}
      series={series.map((s) => ({
        id: s.key,
        label: metricLabel(s.key),
        data: s.points.map((p) => p.value),
        valueFormatter: (v: number | null) => formatMetric(v, s.unit),
        showMark: days.length <= 31,
      }))}
    />
  );
}
