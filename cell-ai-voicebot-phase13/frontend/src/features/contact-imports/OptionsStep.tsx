import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { useContactTags, useListOptions } from '@/features/contacts/queries';
import type { ImportJob, ImportOptions } from '@/services/api/types';

/** Default list name: file name + today (YYYY-MM-DD in the account timezone). */
const defaultName = (fileName: string, today: string) =>
  `${fileName.replace(/\.(csv|xlsx)$/i, '').slice(0, 80)} ${today}`;

/** Step "Options": target list, update existing, tags, consent. */
export function OptionsStep({
  job,
  today,
  busy,
  onBack,
  onSubmit,
}: {
  job: ImportJob;
  /** `YYYY-MM-DD` in the account timezone. */
  today: string;
  busy: boolean;
  onBack: () => void;
  onSubmit: (options: ImportOptions) => void;
}) {
  const lists = useListOptions();
  const tagOptions = useContactTags();
  const saved = job.options;
  const [mode, setMode] = useState<'new' | 'existing'>(saved?.list.mode ?? 'new');
  const [name, setName] = useState(
    saved?.list.mode === 'new' ? saved.list.name : defaultName(job.fileName, today),
  );
  const [listId, setListId] = useState(saved?.list.mode === 'existing' ? saved.list.listId : '');
  const [updateExisting, setUpdateExisting] = useState(saved?.updateExisting ?? true);
  const [tags, setTags] = useState<string[]>(saved?.tags ?? []);
  const [consentSource, setConsentSource] = useState(saved?.consentSource ?? '');
  const ready = mode === 'new' ? name.trim().length > 0 : Boolean(listId);

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 560 }}>
      <div>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Put the contacts in
        </Typography>
        <RadioGroup
          row
          value={mode}
          onChange={(e) => setMode(e.target.value as 'new' | 'existing')}
        >
          <FormControlLabel value="new" control={<Radio />} label="A new list" />
          <FormControlLabel value="existing" control={<Radio />} label="An existing list" />
        </RadioGroup>
        {mode === 'new' ? (
          <TextField
            fullWidth
            size="small"
            label="List name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        ) : (
          <TextField
            select
            fullWidth
            size="small"
            label="List"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
          >
            {(lists.data ?? []).map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.name}
              </MenuItem>
            ))}
          </TextField>
        )}
      </div>
      <FormControlLabel
        control={
          <Switch checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
        }
        label="Update contacts that already exist (empty cells never clear their values)"
      />
      <Autocomplete
        multiple
        freeSolo
        options={(tagOptions.data ?? []).map((t) => t.tag)}
        value={tags}
        onChange={(_e, v) => setTags(v.map((t) => t.trim().toLowerCase()).filter(Boolean))}
        renderInput={(p) => (
          <TextField
            {...p}
            label="Tags for every imported contact"
            helperText="Optional — press Enter after each tag"
          />
        )}
      />
      <TextField
        label="Consent / relationship"
        value={consentSource}
        onChange={(e) => setConsentSource(e.target.value)}
        helperText="Optional, e.g. Loan agreement — recorded on every contact"
      />
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button onClick={onBack}>Back</Button>
        <Button
          variant="contained"
          disabled={!ready || busy}
          onClick={() =>
            onSubmit({
              list:
                mode === 'new' ? { mode: 'new', name: name.trim() } : { mode: 'existing', listId },
              updateExisting,
              tags,
              consentSource: consentSource.trim() || null,
            })
          }
        >
          Check the file
        </Button>
      </Stack>
    </Stack>
  );
}
