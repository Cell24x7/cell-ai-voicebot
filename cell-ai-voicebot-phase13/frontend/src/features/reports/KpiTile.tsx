import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined';
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import type { Report } from '@/services/api/types';

import { deltaOf, formatMetric, metricHelp, metricLabel } from './labels';

/** One KPI: value, change against the previous period, the definition on hover. */
export function KpiTile({ kpi, action }: { kpi: Report['kpis'][number]; action?: ReactNode }) {
  const delta = kpi.previous === undefined ? null : deltaOf(kpi.value, kpi.previous);
  const label = metricLabel(kpi.key);
  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }} component="section" aria-label={label}>
      <Tooltip title={metricHelp(kpi.key)} placement="top-start">
        <Typography variant="body2" color="text.secondary" sx={{ width: 'fit-content' }}>
          {label}
        </Typography>
      </Tooltip>
      <Typography variant="h5" component="p" sx={{ mt: 0.5 }}>
        {formatMetric(kpi.value, kpi.unit)}
      </Typography>
      {kpi.previous !== undefined && (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 0.5 }}>
          {delta?.direction === 'up' && <ArrowUpwardOutlined fontSize="inherit" color="action" />}
          {delta?.direction === 'down' && (
            <ArrowDownwardOutlined fontSize="inherit" color="action" />
          )}
          <Typography variant="caption" color="text.secondary">
            {delta ? `${delta.text} · ` : ''}before: {formatMetric(kpi.previous, kpi.unit)}
          </Typography>
        </Stack>
      )}
      {action}
    </Paper>
  );
}
