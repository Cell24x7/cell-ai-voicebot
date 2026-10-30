import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ComponentProps, ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { emailField } from '@/features/auth/schemas';
import { billingKeys } from '@/features/wallet/keys';
import { useGstStates } from '@/features/wallet/queries';
import { billingApi } from '@/services/api/billing';
import { applyFieldErrors, getErrorMessage, toApiError } from '@/services/api/errors';
import type { BillingProfile, BillingProfileResponse } from '@/services/api/types';
import { gstinHint, LATIN_MESSAGE, LATIN_TEXT } from '@/utils/gstin';

const latin = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}`)
    .max(max, `At most ${max} characters`)
    .regex(LATIN_TEXT, LATIN_MESSAGE);

const schema = z
  .object({
    legalName: latin('the legal name', 120),
    email: emailField,
    addressLine1: latin('the address', 120),
    addressLine2: z
      .string()
      .trim()
      .max(120, 'At most 120 characters')
      .refine((v) => !v || LATIN_TEXT.test(v), LATIN_MESSAGE),
    city: latin('the city', 60),
    stateCode: z.string().min(1, 'Choose the GST state'),
    pin: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/, 'PIN must be 6 digits'),
    gstin: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    const hint = gstinHint(v.gstin, v.stateCode || undefined);
    if (hint) ctx.addIssue({ code: 'custom', path: ['gstin'], message: hint });
  });
type Values = z.infer<typeof schema>;

const valuesOf = (p: BillingProfile | null | undefined): Values => ({
  legalName: p?.legalName ?? '',
  email: p?.email ?? '',
  addressLine1: p?.addressLine1 ?? '',
  addressLine2: p?.addressLine2 ?? '',
  city: p?.city ?? '',
  stateCode: p?.stateCode ?? '',
  pin: p?.pin ?? '',
  gstin: p?.gstin ?? '',
});

/**
 * GST billing details (`PUT /billing/profile`). Used by Settings → Billing
 * details and the Add-money dialog. Read-only without `wallet.topup` or
 * while impersonating (`readOnly`).
 */
export function BillingProfileForm({
  profile,
  readOnly = false,
  submitLabel = 'Save billing details',
  onSaved,
  secondaryAction,
}: {
  profile: BillingProfile | null | undefined;
  readOnly?: boolean;
  submitLabel?: string;
  onSaved?: (saved: BillingProfileResponse) => void;
  secondaryAction?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const states = useGstStates();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(profile),
  });
  const save = useMutation({
    mutationFn: (v: Values) =>
      billingApi.saveProfile({
        ...v,
        addressLine2: v.addressLine2 || null,
        gstin: v.gstin ? v.gstin.toUpperCase() : null,
      }),
    meta: { silent: true },
    onSuccess: (saved) => {
      queryClient.setQueryData(billingKeys.profile, saved);
      form.reset(valuesOf(saved.profile));
      onSaved?.(saved);
    },
    onError: (error) => {
      applyFieldErrors(form.setError, error);
    },
  });
  const error = save.error ? toApiError(save.error) : null;
  const { errors } = form.formState;
  const field = (
    name: keyof Values,
    label: string,
    extra: Partial<ComponentProps<typeof TextField>> = {},
  ) => (
    <TextField
      fullWidth
      {...extra}
      label={label}
      disabled={readOnly}
      {...form.register(name)}
      error={Boolean(errors[name])}
      helperText={errors[name]?.message ?? extra.helperText}
    />
  );

  return (
    <form noValidate onSubmit={(e) => void form.handleSubmit((v) => save.mutate(v))(e)}>
      <Stack spacing={2}>
        {error && error.code !== 'VALIDATION_FAILED' && (
          <Alert severity="error">{getErrorMessage(error)}</Alert>
        )}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            {field('legalName', 'Legal name (as on GST registration)')}
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            {field('email', 'Billing email', {
              type: 'email',
              helperText: 'Invoices and receipts go here',
            })}
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>{field('addressLine1', 'Address line 1')}</Grid>
          <Grid size={{ xs: 12, md: 6 }}>{field('addressLine2', 'Address line 2 (optional)')}</Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>{field('city', 'City')}</Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Controller
              control={form.control}
              name="stateCode"
              render={({ field: f }) => (
                <TextField
                  select
                  fullWidth
                  label="State (place of supply)"
                  disabled={readOnly || !states.data}
                  {...f}
                  error={Boolean(errors.stateCode) || states.isError}
                  helperText={
                    errors.stateCode?.message ??
                    (states.isError ? 'Could not load the state list' : undefined)
                  }
                >
                  {(states.data ?? []).map((s) => (
                    <MenuItem key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            {field('pin', 'PIN code', {
              slotProps: { htmlInput: { inputMode: 'numeric', maxLength: 6 } },
            })}
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            {field('gstin', 'GSTIN (optional)', {
              helperText: 'Add it to claim input tax credit',
              slotProps: { htmlInput: { style: { textTransform: 'uppercase' }, maxLength: 15 } },
            })}
          </Grid>
        </Grid>
        {!readOnly && (
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            {secondaryAction}
            <Button type="submit" variant="contained" disabled={save.isPending}>
              {submitLabel}
            </Button>
          </Stack>
        )}
      </Stack>
    </form>
  );
}
