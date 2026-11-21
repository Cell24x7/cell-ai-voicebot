import Button from '@mui/material/Button';
import { useMutation } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';

import { useConfirm } from '@/components/confirm-context';
import { getErrorMessage } from '@/services/api/errors';
import { whatsappCallingApi } from '@/services/api/whatsapp-calling';

/** SAC-T7: end every live AI call on the number politely (calls with a person stay). */
export function StopAiCallsButton({ channelId }: { channelId: string }) {
  const confirm = useConfirm();
  const stop = useMutation({
    mutationFn: () => whatsappCallingApi.stopAiCalls(channelId),
    meta: { silent: true },
    onSuccess: ({ stopped }) =>
      enqueueSnackbar(
        stopped ? `${String(stopped)} AI call(s) are ending` : 'No AI call is live on this number',
        { variant: 'success' },
      ),
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: 'error' }),
  });
  const onClick = async () => {
    const ok = await confirm({
      title: 'Stop live AI calls?',
      message:
        'Every AI call on this number ends now with a polite goodbye. Calls with a team member go on. New calls still follow the setting above.',
      confirmText: 'Stop AI calls',
      destructive: true,
    });
    if (ok) stop.mutate();
  };
  return (
    <Button
      size="small"
      color="error"
      variant="outlined"
      sx={{ alignSelf: 'flex-start' }}
      disabled={stop.isPending}
      onClick={() => void onClick()}
    >
      Stop live AI calls
    </Button>
  );
}
