import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState, type ReactNode } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { contactsApi, type BulkAction, type BulkRequest } from '@/services/api/contacts';
import { getErrorMessage } from '@/services/api/errors';
import type { ContactFilter } from '@/services/api/types';

import { contactKeys, dndKeys, listKeys } from './keys';
import { useContactTags, useListOptions } from './queries';

type Picker =
  | { kind: 'tags'; action: 'add_tags' | 'remove_tags' }
  | { kind: 'list'; action: 'add_to_list' | 'remove_from_list' };

const TITLES: Record<string, string> = {
  add_tags: 'Add tags',
  remove_tags: 'Remove tags',
  add_to_list: 'Add to a list',
  remove_from_list: 'Remove from a list',
};

/** Selection summary + bulk actions (ids, or every contact matching the filters). */
export function BulkActionsBar({
  selectedIds,
  allMatching,
  total,
  filter,
  onSelectAllMatching,
  onClear,
  extraActions,
}: {
  selectedIds: string[];
  allMatching: boolean;
  total: number;
  /** `null` = "all matching" not possible for the current view. */
  filter: ContactFilter | null;
  onSelectAllMatching: () => void;
  onClear: () => void;
  extraActions?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [listId, setListId] = useState<string | null>(null);
  const tagOptions = useContactTags();
  const lists = useListOptions();
  const count = allMatching ? total : selectedIds.length;

  const run = useMutation({
    mutationFn: (req: BulkRequest) => contactsApi.bulk(req),
    meta: { silent: true },
    onSuccess: (result) => {
      if (result.jobQueued) {
        enqueueSnackbar(`Working on ${result.count} contacts in the background…`, {
          variant: 'info',
        });
      } else {
        enqueueSnackbar(`Done — ${result.count} contacts changed`, { variant: 'success' });
      }
      for (const key of [contactKeys.all, listKeys.all, dndKeys.all]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      setPicker(null);
      onClear();
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });

  const send = (action: BulkAction, payload: BulkRequest['payload'] = {}) =>
    run.mutate({
      action,
      payload,
      ...(allMatching && filter ? { filter } : { ids: selectedIds }),
    });

  const choose = async (action: BulkAction) => {
    setAnchor(null);
    if (action === 'add_tags' || action === 'remove_tags') {
      setTags([]);
      setPicker({ kind: 'tags', action });
    } else if (action === 'add_to_list' || action === 'remove_from_list') {
      setListId(null);
      setPicker({ kind: 'list', action });
    } else if (action === 'delete') {
      if (
        await confirm({
          title: `Delete ${count} contacts?`,
          message: 'They can be restored by adding the same numbers again within 30 days.',
          confirmText: 'Delete',
          destructive: true,
        })
      )
        send('delete');
    } else if (
      await confirm({
        title: `Add ${count} numbers to the do-not-call list?`,
        message:
          'They stay in your contacts but must not be called. Only an owner or admin can take numbers off the list.',
        confirmText: 'Add to do-not-call',
      })
    ) {
      send('add_to_dnd');
    }
  };

  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1, mb: 1 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ alignItems: { sm: 'center' } }}
      >
        <Typography variant="body2" sx={{ flexGrow: 1 }}>
          {allMatching
            ? `All ${total} matching contacts selected.`
            : `${selectedIds.length} selected.`}{' '}
          {!allMatching && filter && total > selectedIds.length && (
            <Link component="button" type="button" onClick={onSelectAllMatching}>
              Select all {total} matching
            </Link>
          )}
        </Typography>
        <Button onClick={(e) => setAnchor(e.currentTarget)} disabled={run.isPending}>
          Actions
        </Button>
        {extraActions}
        <Button onClick={onClear}>Clear</Button>
      </Stack>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {(['add_tags', 'remove_tags', 'add_to_list', 'remove_from_list'] as const).map((a) => (
          <MenuItem key={a} onClick={() => void choose(a)}>
            {TITLES[a]}
          </MenuItem>
        ))}
        <MenuItem onClick={() => void choose('add_to_dnd')}>Add to do-not-call</MenuItem>
        <MenuItem onClick={() => void choose('delete')} sx={{ color: 'error.main' }}>
          Delete
        </MenuItem>
      </Menu>
      <Dialog
        open={Boolean(picker)}
        onClose={() => setPicker(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="bulk-title"
      >
        <DialogTitle id="bulk-title">{picker ? TITLES[picker.action] : ''}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {count} contacts
          </Typography>
          {picker?.kind === 'tags' ? (
            <Autocomplete
              multiple
              freeSolo
              options={(tagOptions.data ?? []).map((t) => t.tag)}
              value={tags}
              onChange={(_e, v) => setTags(v.map((t) => t.trim().toLowerCase()).filter(Boolean))}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Tags"
                  autoFocus
                  helperText="Press Enter after each tag"
                />
              )}
            />
          ) : (
            <Autocomplete
              options={(lists.data ?? []).map((l) => l.id)}
              getOptionLabel={(id) => lists.data?.find((l) => l.id === id)?.name ?? id}
              value={listId}
              onChange={(_e, v) => setListId(v)}
              renderInput={(params) => <TextField {...params} label="List" autoFocus />}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPicker(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={run.isPending || (picker?.kind === 'tags' ? !tags.length : !listId)}
            onClick={() =>
              picker &&
              send(picker.action, picker.kind === 'tags' ? { tags } : { listId: listId ?? '' })
            }
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
