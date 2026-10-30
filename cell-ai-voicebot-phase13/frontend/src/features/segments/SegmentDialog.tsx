import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { segmentKeys } from '@/features/contacts/keys';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import { segmentsApi } from '@/services/api/segments';
import type { ContactFilter, CustomField, Segment } from '@/services/api/types';

import {
  checkConditions,
  filterErrors,
  fromFilter,
  hasProblems,
  toContactFilter,
  type BuilderState,
} from './segment-filter';
import { SegmentBuilder } from './SegmentBuilder';
import { SegmentPreview } from './SegmentPreview';

/** Create or edit a segment (name + filter with a live count). */
export function SegmentDialog({
  open,
  onClose,
  fields,
  segment,
  initialFilter,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  fields: CustomField[];
  segment?: Segment;
  initialFilter?: ContactFilter;
  onSaved?: (segment: Segment) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(segment?.name ?? '');
  const [state, setState] = useState<BuilderState>(() =>
    fromFilter(segment?.filter ?? initialFilter),
  );
  const filter = toContactFilter(state, fields);
  const invalid = hasProblems(checkConditions(state.conditions, fields));
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), filter };
      return segment ? segmentsApi.update(segment.id, body) : segmentsApi.create(body);
    },
    meta: { silent: true },
    onSuccess: (saved) => {
      enqueueSnackbar(segment ? 'Segment saved' : 'Segment created', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: segmentKeys.all });
      onSaved?.(saved);
      onClose();
    },
  });
  const error = save.error ? toApiError(save.error) : null;
  const nameError =
    error?.code === 'CONFLICT_DUPLICATE'
      ? 'A segment with this name already exists.'
      : error?.details.find((d) => d.path.endsWith('name'))?.message;
  const serverErrors = save.error ? filterErrors(save.error) : {};
  const otherError =
    error && !nameError && Object.keys(serverErrors).length === 0
      ? getErrorMessage(save.error)
      : null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="segment-title">
      <DialogTitle id="segment-title">{segment ? 'Edit segment' : 'New segment'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Segment name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={Boolean(nameError)}
            helperText={nameError ?? 'e.g. Overdue > 30 days'}
            slotProps={{ htmlInput: { maxLength: 100 } }}
            autoFocus
          />
          <SegmentBuilder
            value={state}
            onChange={setState}
            fields={fields}
            serverErrors={serverErrors}
          />
          <Divider />
          <SegmentPreview filter={filter} />
          {otherError && <Alert severity="error">{otherError}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!name.trim() || invalid || save.isPending}
          onClick={() => save.mutate()}
        >
          {segment ? 'Save' : 'Create segment'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
