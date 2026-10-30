import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import type { ReactNode } from 'react';

import { getErrorMessage } from '@/services/api/errors';

import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  /** Server-side sort field; the header becomes clickable when `sort` is set. */
  sortField?: string;
}

export interface TableSort {
  field: string;
  direction: 'asc' | 'desc';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Offset pagination (1-based page). */
  pagination?: {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
    onLimitChange?: (limit: number) => void;
  };
  footer?: ReactNode;
  'aria-label'?: string;
  /** Row checkboxes (ids of the selected rows). */
  selection?: { selected: ReadonlySet<string>; onChange: (next: Set<string>) => void };
  /** Accessible name of a row's checkbox (default: the row id). */
  getRowLabel?: (row: T) => string;
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
}

/** Table with loading skeleton, empty state, error + retry, and pagination. */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading,
  error,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  pagination,
  footer,
  'aria-label': ariaLabel,
  selection,
  getRowLabel,
  sort,
  onSortChange,
}: DataTableProps<T>) {
  const pageIds = (rows ?? []).map(getRowId);
  const selectedOnPage = pageIds.filter((id) => selection?.selected.has(id)).length;
  const toggleAll = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (selectedOnPage === pageIds.length) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    selection.onChange(next);
  };
  const toggle = (id: string) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  };
  return (
    <Paper variant="outlined">
      {Boolean(error) && (
        <Alert
          severity="error"
          action={
            onRetry && (
              <Button color="inherit" size="small" onClick={onRetry}>
                Retry
              </Button>
            )
          }
          sx={{ borderRadius: 0 }}
        >
          {getErrorMessage(error)}
        </Alert>
      )}
      <TableContainer>
        <Table size="small" aria-label={ariaLabel} aria-busy={loading ? 'true' : undefined}>
          <TableHead>
            <TableRow>
              {selection && (
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={pageIds.length > 0 && selectedOnPage === pageIds.length}
                    indeterminate={selectedOnPage > 0 && selectedOnPage < pageIds.length}
                    onChange={toggleAll}
                    disabled={!pageIds.length}
                    slotProps={{ input: { 'aria-label': 'Select all on this page' } }}
                  />
                </TableCell>
              )}
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  align={c.align}
                  sx={{ width: c.width, fontWeight: 600 }}
                  sortDirection={sort && c.sortField === sort.field ? sort.direction : false}
                >
                  {c.sortField && sort && onSortChange ? (
                    <TableSortLabel
                      active={c.sortField === sort.field}
                      direction={c.sortField === sort.field ? sort.direction : 'asc'}
                      onClick={() =>
                        onSortChange({
                          field: c.sortField as string,
                          direction:
                            c.sortField === sort.field && sort.direction === 'asc' ? 'desc' : 'asc',
                        })
                      }
                    >
                      {c.header}
                    </TableSortLabel>
                  ) : (
                    c.header
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading &&
              Array.from({ length: 3 }, (_, i) => (
                <TableRow key={`s${i}`}>
                  {selection && <TableCell padding="checkbox" />}
                  {columns.map((c) => (
                    <TableCell key={c.key}>
                      <Skeleton />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!loading &&
              rows?.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  hover
                  selected={selection?.selected.has(getRowId(row)) ?? false}
                >
                  {selection && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selection.selected.has(getRowId(row))}
                        onChange={() => toggle(getRowId(row))}
                        slotProps={{
                          input: {
                            'aria-label': `Select ${getRowLabel ? getRowLabel(row) : getRowId(row)}`,
                          },
                        }}
                      />
                    </TableCell>
                  )}
                  {columns.map((c) => (
                    <TableCell key={c.key} align={c.align}>
                      {c.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!loading && !error && rows?.length === 0 && (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      )}
      {pagination && (
        <TablePagination
          component="div"
          count={pagination.total}
          page={Math.max(0, pagination.page - 1)}
          rowsPerPage={pagination.limit}
          rowsPerPageOptions={pagination.onLimitChange ? [10, 20, 50, 100] : [pagination.limit]}
          onPageChange={(_e, p) => pagination.onPageChange(p + 1)}
          onRowsPerPageChange={(e) => pagination.onLimitChange?.(Number(e.target.value))}
        />
      )}
      {footer}
    </Paper>
  );
}
