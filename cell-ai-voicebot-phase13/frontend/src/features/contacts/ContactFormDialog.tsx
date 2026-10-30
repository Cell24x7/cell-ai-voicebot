import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link as RouterLink } from 'react-router';

import { contactsApi } from '@/services/api/contacts';
import { applyFieldErrors, getErrorMessage, toApiError } from '@/services/api/errors';
import type { Contact, CustomField } from '@/services/api/types';

import {
  buildContactSchema,
  contactDefaults,
  toContactInput,
  type ContactFormValues,
} from './contact-form';
import { contactKeys } from './keys';
import { useContactTags, useListOptions } from './queries';

const INPUT_TYPE: Record<CustomField['type'], string> = {
  text: 'text',
  number: 'text',
  currency: 'text',
  date: 'date',
  phone: 'tel',
};

/** Create or edit a contact; the form is built from the account's fields. */
export function ContactFormDialog({
  open,
  onClose,
  fields,
  contact,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  fields: CustomField[];
  contact?: Contact;
  /** New contact prefilled (e.g. a contact card shared on WhatsApp). */
  initial?: Partial<Pick<ContactFormValues, 'phone' | 'name' | 'email'>>;
}) {
  const queryClient = useQueryClient();
  const schema = useMemo(() => buildContactSchema(fields), [fields]);
  const lists = useListOptions();
  const tags = useContactTags();
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...contactDefaults(fields, contact), ...initial },
  });
  const save = useMutation({
    mutationFn: (values: ContactFormValues) => {
      const body = toContactInput(values, fields, contact);
      return contact ? contactsApi.update(contact.id, body) : contactsApi.create(body);
    },
    meta: { silent: true },
    onSuccess: (saved) => {
      enqueueSnackbar(contact ? 'Contact saved' : 'Contact added', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
      queryClient.setQueryData(contactKeys.detail(saved.id), saved);
      onClose();
    },
    onError: (error) => {
      if (toApiError(error).code !== 'CONFLICT_DUPLICATE') applyFieldErrors(form.setError, error);
    },
  });
  const error = save.error ? toApiError(save.error) : null;
  const existingId =
    error?.code === 'CONFLICT_DUPLICATE' ? error.details[0]?.existingId : undefined;
  const { errors } = form.formState;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="contact-form-title"
    >
      <form noValidate onSubmit={(e) => void form.handleSubmit((v) => save.mutate(v))(e)}>
        <DialogTitle id="contact-form-title">
          {contact ? 'Edit contact' : 'Add a contact'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && error.code !== 'VALIDATION_FAILED' && (
              <Alert severity="error">
                {getErrorMessage(error)}{' '}
                {existingId && (
                  <Link component={RouterLink} to={`/contacts/c/${existingId}`} onClick={onClose}>
                    Open existing contact
                  </Link>
                )}
              </Alert>
            )}
            <TextField
              label="Phone"
              required
              autoFocus={!contact}
              {...form.register('phone')}
              error={Boolean(errors.phone)}
              helperText={
                errors.phone?.message ?? 'Any format — 98765 43210, +91 98765 43210, 0987…'
              }
            />
            <TextField
              label="Name"
              {...form.register('name')}
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="E-mail"
                type="email"
                fullWidth
                {...form.register('email')}
                error={Boolean(errors.email)}
                helperText={errors.email?.message}
              />
              <TextField
                label="External id"
                fullWidth
                {...form.register('externalId')}
                error={Boolean(errors.externalId)}
                helperText={errors.externalId?.message ?? 'Loan / customer id from your system'}
              />
            </Stack>
            {fields.length > 0 && (
              <>
                <Divider textAlign="left">
                  <Typography variant="caption" color="text.secondary">
                    Details
                  </Typography>
                </Divider>
                {fields.map((f) => {
                  const fieldError = errors.variables?.[f.key];
                  return (
                    <TextField
                      key={f.key}
                      label={f.label}
                      required={f.required}
                      type={INPUT_TYPE[f.type]}
                      {...form.register(`variables.${f.key}`)}
                      error={Boolean(fieldError)}
                      helperText={fieldError?.message}
                      slotProps={{
                        inputLabel: f.type === 'date' ? { shrink: true } : undefined,
                        input:
                          f.type === 'currency'
                            ? {
                                startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                              }
                            : undefined,
                        htmlInput:
                          f.type === 'number' || f.type === 'currency'
                            ? { inputMode: 'decimal' }
                            : undefined,
                      }}
                    />
                  );
                })}
              </>
            )}
            <Controller
              control={form.control}
              name="tags"
              render={({ field }) => (
                <Autocomplete
                  multiple
                  freeSolo
                  options={(tags.data ?? []).map((t) => t.tag)}
                  value={field.value}
                  onChange={(_e, value) =>
                    field.onChange(value.map((v) => v.trim().toLowerCase()).filter(Boolean))
                  }
                  renderValue={(value, getItemProps) =>
                    value.map((option, index) => {
                      const { key, ...itemProps } = getItemProps({ index });
                      return <Chip key={key} size="small" label={option} {...itemProps} />;
                    })
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Tags"
                      error={Boolean(errors.tags)}
                      helperText={errors.tags?.message ?? 'Press Enter after each tag'}
                    />
                  )}
                />
              )}
            />
            <Controller
              control={form.control}
              name="listIds"
              render={({ field }) => (
                <Autocomplete
                  multiple
                  options={(lists.data ?? []).map((l) => l.id)}
                  getOptionLabel={(id) => lists.data?.find((l) => l.id === id)?.name ?? id}
                  value={field.value}
                  onChange={(_e, value) => field.onChange(value)}
                  renderInput={(params) => <TextField {...params} label="Lists" />}
                />
              )}
            />
            <TextField
              label="Consent / relationship"
              {...form.register('consentSource')}
              helperText="e.g. Loan agreement — recorded with today's date when changed"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={save.isPending}>
            {contact ? 'Save' : 'Add contact'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
