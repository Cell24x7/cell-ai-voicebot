import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { segmentKeys } from '@/features/contacts/keys';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/services/api/errors';
import { segmentsApi } from '@/services/api/segments';
import type { ContactFilter } from '@/services/api/types';
import { formatNumber } from '@/utils/format';
import { formatPhone } from '@/utils/phone';

export const PREVIEW_DEBOUNCE_MS = 400;

/** Live "N contacts match" for a filter (debounced 400 ms). */
export function SegmentPreview({ filter }: { filter: ContactFilter }) {
  // Debounce the JSON text: the filter object is rebuilt on every render.
  const text = useDebouncedValue(JSON.stringify(filter), PREVIEW_DEBOUNCE_MS);
  const debounced = useMemo(() => JSON.parse(text) as ContactFilter, [text]);
  const preview = useQuery({
    queryKey: segmentKeys.preview(debounced),
    queryFn: () => segmentsApi.preview(debounced),
    placeholderData: keepPreviousData,
    meta: { silent: true },
  });
  if (preview.error) return <Alert severity="warning">{getErrorMessage(preview.error)}</Alert>;
  if (!preview.data) return <CircularProgress size={20} aria-label="Counting contacts" />;
  const { count, sample } = preview.data;
  return (
    <Stack spacing={0.5} aria-live="polite">
      <Typography variant="subtitle1">
        {formatNumber(count)} {count === 1 ? 'contact matches' : 'contacts match'}
        {preview.isFetching && (
          <CircularProgress size={14} sx={{ ml: 1 }} aria-label="Updating count" />
        )}
      </Typography>
      {sample.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          e.g. {sample.map((c) => c.name ?? formatPhone(c.phoneE164)).join(', ')}
          {count > sample.length ? ' …' : ''}
        </Typography>
      )}
    </Stack>
  );
}
