import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { useCallback, useRef, useState, type ReactNode } from 'react';

import { ConfirmContext, type ConfirmOptions } from './confirm-context';

/** Promise-based confirm dialog for the whole app. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOptions(next);
      }),
    [],
  );

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext value={confirm}>
      {children}
      <Dialog
        open={Boolean(options)}
        onClose={() => close(false)}
        aria-labelledby="confirm-title"
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle id="confirm-title">{options?.title}</DialogTitle>
        {options?.message && (
          <DialogContent>
            <DialogContentText>{options.message}</DialogContentText>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => close(false)}>{options?.cancelText ?? 'Cancel'}</Button>
          <Button
            variant="contained"
            color={options?.destructive ? 'error' : 'primary'}
            onClick={() => close(true)}
            autoFocus
          >
            {options?.confirmText ?? 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext>
  );
}
