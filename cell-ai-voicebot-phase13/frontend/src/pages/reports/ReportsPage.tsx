import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { lazy, Suspense } from 'react';
import {
  Navigate,
  Link as RouterLink,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { useCan, useSession } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { outcomeLabel, useDispositions } from '@/features/insights/queries';
import { FilterBar } from '@/features/reports/FilterBar';
import {
  filtersFromParams,
  filtersToParams,
  isReportTab,
  REPORT_TABS,
  toQuery,
  type ReportFilters,
} from '@/features/reports/filters';
import { KpiTile } from '@/features/reports/KpiTile';
import { formatMetric, metricLabel } from '@/features/reports/labels';
import { useReport } from '@/features/reports/queries';
import { RecentExportsButton } from '@/features/reports/RecentExports';
import { RecordExportButton } from '@/features/reports/RecordExportButton';
import { ReportTable } from '@/features/reports/ReportTable';
import { getErrorMessage } from '@/services/api/errors';
import { recordExportsApi } from '@/services/api/record-exports';
import type { ReportTab } from '@/services/api/reports';
import type { Report } from '@/services/api/types';
import { todayInTz } from '@/utils/datetime';

const TrendChart = lazy(() => import('@/features/reports/TrendChart'));

/** Series split by unit (one chart each — counts and money don't share an axis). */
const byUnit = (series: Report['series']) => {
  const out = new Map<string, Report['series']>();
  for (const s of series) out.set(s.unit, [...(out.get(s.unit) ?? []), s]);
  return [...out.values()];
};

function SeriesTable({ series }: { series: Report['series'] }) {
  return (
    <Table size="small" aria-label="Chart as a table">
      <TableHead>
        <TableRow>
          <TableCell>Day</TableCell>
          {series.map((s) => (
            <TableCell key={s.key} align="right">
              {metricLabel(s.key)}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {(series[0]?.points ?? []).map((p, i) => (
          <TableRow key={p.day}>
            <TableCell>{p.day}</TableCell>
            {series.map((s) => (
              <TableCell key={s.key} align="right">
                {formatMetric(s.points[i]?.value, s.unit)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const callsLink = (f: ReportFilters, extra: Record<string, string> = {}) =>
  `/calls?${new URLSearchParams({ from: f.from, to: f.to, ...extra }).toString()}`;

/** `/reports/:tab` (Phase 14, reports.read). */
export function ReportsPage() {
  const { tab = 'overview' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const timezone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  const today = todayInTz(timezone);
  const filters = filtersFromParams(params, today);
  const valid = isReportTab(tab);
  const current: ReportTab = valid ? tab : 'overview';
  const report = useReport(current, toQuery(filters, current), valid);
  const dispositions = useDispositions(current === 'calls');
  const can = useCan();
  const impersonating = Boolean(useSession()?.impersonation);
  const canExport = can('reports.export') && !impersonating;
  if (!valid) return <Navigate to="/reports" replace />;

  const data = report.data;
  const linkOf = (row: Report['table']['rows'][number]): string | null => {
    if (!row.id) return current === 'calls' ? callsLink(filters) : null;
    switch (current) {
      case 'calls':
        return callsLink(filters, { disposition: row.id });
      case 'campaigns':
        return `/campaigns/${row.id}`;
      case 'flows':
        return filters.slice?.key === 'flowId' ? null : `/flows/${row.id}`;
      case 'agents':
        return `/agents/${row.id}`;
      case 'templates':
        return '/whatsapp/templates';
      default:
        return null;
    }
  };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Calls, WhatsApp and spend — from daily totals"
        actions={
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {current === 'calls' && (
              <Button component={RouterLink} to={callsLink(filters)}>
                See these calls
              </Button>
            )}
            {canExport && (
              <RecordExportButton
                title="Export this report"
                note="The numbers and table of this tab, with the filters above."
                start={(format) =>
                  recordExportsApi.report(format, current, toQuery(filters, current))
                }
              />
            )}
            {canExport && current === 'whatsapp' && (
              <RecordExportButton
                label="Export messages"
                title="Export WhatsApp messages"
                note="One row per message: time, direction, type, status, template, number and team member — never the message text."
                start={(format) =>
                  recordExportsApi.messages({
                    format,
                    from: filters.from,
                    to: filters.to,
                    ...(filters.slice?.key === 'channelId' ? { channelId: filters.slice.id } : {}),
                  })
                }
              />
            )}
            {(canExport || (can('calls.export') && !impersonating)) && <RecentExportsButton />}
          </Stack>
        }
      />
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={current}
          onChange={(_e, v: string) =>
            void navigate({ pathname: `/reports/${v}`, search: params.toString() })
          }
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Report sections"
        >
          {REPORT_TABS.map((t) => (
            <Tab key={t.key} value={t.key} label={t.label} />
          ))}
        </Tabs>
      </Box>
      <Stack spacing={2}>
        <FilterBar
          key={`${filters.preset}-${filters.from}-${filters.to}`}
          filters={filters}
          today={today}
          timezone={timezone}
          onChange={(next) => setParams(filtersToParams(next), { replace: true })}
        />
        {report.isError && (
          <Alert
            severity="error"
            action={<Button onClick={() => void report.refetch()}>Retry</Button>}
          >
            {getErrorMessage(report.error)}
          </Alert>
        )}
        {report.isPending && <Skeleton variant="rounded" height={320} />}
        {data && (
          <>
            <Grid container spacing={2} aria-label="Key numbers">
              {data.kpis.map((k) => (
                <Grid key={k.key} size={{ xs: 6, md: 3, lg: 2 }}>
                  <KpiTile kpi={k} />
                </Grid>
              ))}
            </Grid>
            {byUnit(data.series).map((group) => (
              <Paper
                key={group[0]?.key}
                variant="outlined"
                sx={{ p: 2 }}
                component="section"
                aria-label={`Trend: ${group.map((s) => metricLabel(s.key)).join(', ')}`}
              >
                <Suspense fallback={<Skeleton variant="rounded" height={280} />}>
                  <TrendChart series={group} />
                </Suspense>
                <details>
                  <summary>
                    <Typography component="span" variant="body2">
                      Show as table
                    </Typography>
                  </summary>
                  <SeriesTable series={group} />
                </details>
              </Paper>
            ))}
            {(data.table.columns.length > 0 || current !== 'overview') && (
              <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Details">
                <ReportTable
                  table={data.table}
                  name={`${REPORT_TABS.find((t) => t.key === current)?.label ?? ''} details`}
                  linkOf={linkOf}
                  labelOf={(r) =>
                    current === 'calls' && r.id
                      ? (outcomeLabel(r.id, dispositions.data) ?? r.label)
                      : r.label
                  }
                />
              </Paper>
            )}
            {current === 'calls' && (
              <Typography variant="body2" color="text.secondary">
                Promises and moods come from the AI insights after each call.{' '}
                <Link component={RouterLink} to="/settings/ai">
                  AI settings
                </Link>
              </Typography>
            )}
          </>
        )}
      </Stack>
    </>
  );
}
