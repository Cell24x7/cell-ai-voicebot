import { usePermission, useSession } from '@/features/auth/hooks';
import { useImpersonating } from '@/features/wallet/queries';

const useActing = (): boolean => {
  const impersonating = useImpersonating();
  const active = useSession()?.account.status === 'active';
  return !impersonating && active;
};

/** Place WhatsApp calls (`calls.trigger`), never while impersonating, account active. */
export const useCanCall = (): boolean => {
  const can = usePermission('calls.trigger');
  return useActing() && can;
};

/** Answer / decline ringing WhatsApp calls and set call availability (`calls.answer`). */
export const useCanAnswer = (): boolean => {
  const can = usePermission('calls.answer');
  return useActing() && can;
};

/** Change a number's call settings (`whatsapp.calling.manage`: owners, admins). */
export const useCanManageCalling = (): boolean => {
  const can = usePermission('whatsapp.calling.manage');
  return useActing() && can;
};

/** Ask a customer for call permission (`inbox.reply`). */
export const useCanRequestPermission = (): boolean => {
  const can = usePermission('inbox.reply');
  return useActing() && can;
};
