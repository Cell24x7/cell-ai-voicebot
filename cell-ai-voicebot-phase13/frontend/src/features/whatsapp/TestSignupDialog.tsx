import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { WhatsAppMode } from '@/services/api/types';

import type { SignupOutcome } from './embedded-signup';
import { buildFakeCode, fakeSessionInfo, type FakeOutcome } from './fake-signup';

const OUTCOMES: { value: FakeOutcome; label: string }[] = [
  { value: 'finish', label: 'Finish' },
  { value: 'only_waba', label: 'Finish without a phone number' },
  { value: 'cancel', label: 'Cancel at a step' },
  { value: 'error', label: 'Error' },
];

const schema = z.object({
  businessName: z.string().trim().min(1, 'Enter a business name').max(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s-]{8,20}$/, 'Enter a phone number like +91 90000 12345'),
  displayName: z.string().trim().min(1, 'Enter a display name').max(100),
  outcome: z.enum(['finish', 'only_waba', 'cancel', 'error']),
});
type Values = z.infer<typeof schema>;

/**
 * Fake provider only: stands in for Meta's popup. Builds the same `fake.` code the
 * backend's fake Meta accepts plus the session ids Meta would post.
 */
export function TestSignupDialog({
  open,
  mode,
  onClose,
  onDone,
}: {
  open: boolean;
  mode: WhatsAppMode;
  onClose: () => void;
  onDone: (outcome: SignupOutcome) => void;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      businessName: 'Test Business',
      phone: '+91 90000 ',
      displayName: 'Test Business',
      outcome: 'finish',
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = async (v: Values) => {
    if (v.outcome === 'cancel') {
      onDone({ kind: 'cancelled', step: 'Test signup' });
      return;
    }
    const input = { ...v, mode };
    onDone({
      kind: 'finished',
      code: buildFakeCode(input),
      sessionInfo: await fakeSessionInfo(input),
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="test-signup-title"
    >
      <form noValidate onSubmit={(e) => void form.handleSubmit(submit)(e)}>
        <DialogTitle id="test-signup-title">Test signup (Meta is simulated)</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              Test mode — Meta signup is simulated. Phone numbers ending 00001 need the PIN 123456;
              ending 00002 can&apos;t subscribe.
            </Alert>
            <TextField
              label="Business name"
              {...form.register('businessName')}
              error={Boolean(errors.businessName)}
              helperText={errors.businessName?.message}
            />
            <TextField
              label="Phone number"
              {...form.register('phone')}
              error={Boolean(errors.phone)}
              helperText={errors.phone?.message}
            />
            <TextField
              label="Display name"
              {...form.register('displayName')}
              error={Boolean(errors.displayName)}
              helperText={errors.displayName?.message ?? 'Contains "pending" → name in review'}
            />
            <Controller
              control={form.control}
              name="outcome"
              render={({ field }) => (
                <TextField select label="Outcome" {...field}>
                  {OUTCOMES.map((o) => (
                    <MenuItem key={o.value} value={o.value}>
                      {o.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            Finish signup
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
