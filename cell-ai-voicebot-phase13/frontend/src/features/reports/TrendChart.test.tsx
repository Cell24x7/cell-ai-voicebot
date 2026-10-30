import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import TrendChart from './TrendChart';

const chart = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('@mui/x-charts/LineChart', () => ({
  LineChart: (props: Record<string, unknown>) => {
    chart.props = props;
    return <div data-testid="line-chart" />;
  },
}));

type Props = {
  xAxis: { data: string[] }[];
  yAxis: { valueFormatter: (v: number) => string }[];
  series: {
    label: string;
    data: (number | null)[];
    showMark: boolean;
    valueFormatter: (v: number | null) => string;
  }[];
};

describe('TrendChart', () => {
  it('one line per series, days as MM-DD, values in their unit', () => {
    render(
      <TrendChart
        series={[
          {
            key: 'spend',
            unit: 'micros',
            points: [
              { day: '2026-10-26', value: 1_000_000 },
              { day: '2026-10-27', value: null },
            ],
          },
        ]}
      />,
    );
    const p = chart.props as unknown as Props;
    expect(p.xAxis[0]?.data).toEqual(['10-26', '10-27']);
    expect(p.series[0]).toMatchObject({ label: 'Spend', data: [1_000_000, null], showMark: true });
    expect(p.series[0]?.valueFormatter(null)).toBe('—');
    expect(p.yAxis[0]?.valueFormatter(2_000_000)).toBe('₹2.00');
  });

  it('long ranges hide the marks; no series → empty chart', () => {
    const points = Array.from({ length: 40 }, (_, i) => ({
      day: `2026-09-${String(i).padStart(2, '0')}`,
      value: i,
    }));
    render(<TrendChart series={[{ key: 'calls_attempted', unit: 'count', points }]} />);
    expect((chart.props as unknown as Props).series[0]?.showMark).toBe(false);
    render(<TrendChart series={[]} />);
    expect((chart.props as unknown as Props).xAxis[0]?.data).toEqual([]);
  });
});
