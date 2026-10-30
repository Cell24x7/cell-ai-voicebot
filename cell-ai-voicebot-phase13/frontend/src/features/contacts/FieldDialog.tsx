import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import {
  FIELD_KEY,
  RESERVED_KEYS,
  slugKey,
  TYPE_LABEL,
} from '@/features/contact-imports/import-text';
import { customFieldsApi } from '@/services/api/custom-fields';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { CustomField, FieldType } from '@/services/api/types';
import { fieldInputValue } from '@/utils/format';

import { contactKeys, fieldKeys } from './keys';

const TYPES = Object.keys(TYPE_LABEL) as FieldType[];

/** Problem with the key typed for a new field, or `undefined`. */
const keyProblem = (key: string, fields: CustomField[]): string | undefined => {
  if (!FIELD_KEY.test(key))
    return 'Lower-case letters, digits and _ ; start with a letter (max 40)';
  if (RESERVED_KEYS.includes(key)) return 'This key is reserved';
  if (fields.some((f) => f.key === key)) return 'A field with this key already exists';
  return undefined;
};

/** Create or edit a custom field. The key never changes; the type is locked once used. */
export function FieldDialog({
  field,
  fields,
  onClose,
}: {
  field?: CustomField;
  fields: CustomField[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(field?.label ?? '');
  const [key, setKey] = useState(field?.key ?? '');
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState<FieldType>(field?.type ?? 'text');
  const [required, setRequired] = useState(field?.required ?? false);
  const [defaultValue, setDefaultValue] = useState(
    field?.defaultValue === null || field?.defaultValue === undefined
      ? ''
      : fieldInputValue(field.type, field.defaultValue),
  );
  const used = (field?.usageCount ?? 0) > 0;
  const keyError = field ? undefined : key ? keyProblem(key, fields) : undefined;

  const save = useMutation({
    mutationFn: () => {
      const value = defaultValue.trim() === '' ? null : defaultValue.trim();
      return field
        ? customFieldsApi.update(field.id, {
            label: label.trim(),
            required,
            defaultValue: value,
            ...(type !== field.type ? { type } : {}),
          })
        : customFieldsApi.create({
            key,
            label: label.trim(),
            type,
            required,
            ...(value === null ? {} : { defaultValue: value }),
          });
    },
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar(field ? 'Field saved' : 'Field added', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: fieldKeys.all });
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
      onClose();
    },
  });
  const error = save.error ? toApiError(save.error) : null;
  const serverError = (path: string) => error?.details.find((d) => d.path.endsWith(path))?.message;
  const defaultError = serverError('defaultValue');
  const general =
    error && !defaultError && !serverError('key') && !serverError('label')
      ? getErrorMessage(save.error)
      : null;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="field-title">
      <DialogTitle id="field-title">{field ? 'Edit field' : 'New field'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Label"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              if (!field && !keyTouched) setKey(slugKey(e.target.value));
            }}
            error={Boolean(serverError('label'))}
            helperText={serverError('label') ?? 'What people see, e.g. Loan amount'}
            slotProps={{ htmlInput: { maxLength: 80 } }}
            autoFocus
          />
          <TextField
            label="Key"
            value={key}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value.trim());
            }}
            disabled={Boolean(field)}
            error={Boolean(keyError ?? serverError('key'))}
            helperText={
              keyError ??
              serverError('key') ??
              (field
                ? "The key can't change — scripts and imports use it."
                : 'Used in scripts as {{key}}. It can’t be changed later.')
            }
            slotProps={{ htmlInput: { maxLength: 40 } }}
          />
          <TextField
            select
            label="Type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as FieldType);
              setDefaultValue('');
            }}
            disabled={used}
            helperText={
              used
                ? `Used by ${field?.usageCount ?? 0} contacts — the type can't change.`
                : undefined
            }
          >
            {TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {TYPE_LABEL[t]}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={<Switch checked={required} onChange={(e) => setRequired(e.target.checked)} />}
            label="Required (imports and new contacts must fill it, unless there is a default)"
          />
          <TextField
            label="Default value (optional)"
            type={type === 'date' ? 'date' : 'text'}
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            error={Boolean(defaultError)}
            helperText={defaultError ?? 'Used when a contact has no value.'}
            slotProps={{
              inputLabel: type === 'date' ? { shrink: true } : undefined,
              input: {
                startAdornment:
                  type === 'currency' ? (
                    <InputAdornment position="start">₹</InputAdornment>
                  ) : undefined,
              },
            }}
          />
          {general && <Alert severity="error">{general}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!label.trim() || !key || Boolean(keyError) || save.isPending}
          onClick={() => save.mutate()}
        >
          {field ? 'Save' : 'Add field'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
