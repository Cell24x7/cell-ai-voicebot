import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import type { Report } from '@/services/api/types';

import { formatMetric, metricHelp, metricLabel } from './labels';

type Row = Report['table']['rows'][number];

/** The tab's table: sortable columns, rows linking to their page when `linkOf` gives one. */
export function ReportTable({
  table,
  name,
  linkOf,
  labelOf = (r) => r.label,
}: {
  table: Report['table'];
  name: string;
  linkOf?: (row: Row) => string | null;
  labelOf?: (row: Row) => string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const rows = sort
    ? [...table.rows].sort((a, b) => {
        const x = a.values[sort.key] ?? -Infinity;
        const y = b.values[sort.key] ?? -Infinity;
        return sort.dir === 'asc' ? x - y : y - x;
      })
    : table.rows;
  if (!table.rows.length)
    return (
      <Typography variant="body2" color="text.secondary">
        Nothing to show for this period.
      </Typography>
    );
  return (
    <TableContainer>
      <Table size="small" aria-label={name}>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            {table.columns.map((c) => (
              <TableCell key={c.key} align="right" title={metricHelp(c.key)}>
                <TableSortLabel
                  active={sort?.key === c.key}
                  direction={sort?.key === c.key ? sort.dir : 'desc'}
                  onClick={() =>
                    setSort((s) => ({
                      key: c.key,
                      dir: s?.key === c.key && s.dir === 'desc' ? 'asc' : 'desc',
                    }))
                  }
                >
                  {metricLabel(c.key)}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => {
            const to = linkOf?.(r) ?? null;
            return (
              <TableRow key={r.id ?? r.label}>
                <TableCell>
                  {to ? (
                    <Link component={RouterLink} to={to}>
                      {labelOf(r)}
                    </Link>
                  ) : (
                    labelOf(r)
                  )}
                </TableCell>
                {table.columns.map((c) => (
                  <TableCell key={c.key} align="right">
                    {formatMetric(r.values[c.key], c.unit)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
