import { BarChart } from '@mui/x-charts/BarChart';

import type { UsageSeries } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

import { usageDataset } from './usage-format';

const money = (v: number | null) => (v === null ? '' : formatCurrencyMicros(v));

/** Daily stacked bars: calls / AI / voice / WhatsApp (lazy-loaded — keeps charts out of the main bundle). */
export default function UsageChart({ series }: { series: UsageSeries['series'] }) {
  return (
    <BarChart
      height={320}
      dataset={usageDataset(series)}
      xAxis={[{ scaleType: 'band', dataKey: 'label' }]}
      yAxis={[{ valueFormatter: (v: number) => `₹${Math.round(v / 1_000_000)}`, width: 64 }]}
      series={[
        { dataKey: 'call', label: 'Calls', stack: 'total', valueFormatter: money },
        { dataKey: 'ai', label: 'AI', stack: 'total', valueFormatter: money },
        { dataKey: 'tts', label: 'Voice (TTS)', stack: 'total', valueFormatter: money },
        { dataKey: 'whatsapp', label: 'WhatsApp', stack: 'total', valueFormatter: money },
      ]}
    />
  );
}
