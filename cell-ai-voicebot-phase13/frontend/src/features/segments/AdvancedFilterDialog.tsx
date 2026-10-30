import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import { useState } from 'react';

import type { ContactFilter, CustomField } from '@/services/api/types';

import {
  checkConditions,
  fromFilter,
  hasProblems,
  toContactFilter,
  type BuilderState,
} from './segment-filter';
import { SegmentBuilder } from './SegmentBuilder';
import { SegmentPreview } from './SegmentPreview';

/** The Contacts tab's "Advanced filter" — the segment builder without saving. */
export function AdvancedFilterDialog({
  initial,
  fields,
  onApply,
  onClose,
}: {
  initial: ContactFilter;
  fields: CustomField[];
  onApply: (filter: ContactFilter) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<BuilderState>(() => fromFilter(initial));
  const filter = toContactFilter(state, fields);
  const invalid = hasProblems(checkConditions(state.conditions, fields));
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="adv-title">
      <DialogTitle id="adv-title">Advanced filter</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <SegmentBuilder value={state} onChange={setState} fields={fields} />
          <Divider />
          <SegmentPreview filter={filter} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={invalid} onClick={() => onApply(filter)}>
          Show contacts
        </Button>
      </DialogActions>
    </Dialog>
  );
}
