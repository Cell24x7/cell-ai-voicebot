import { usePermission, useSession } from '@/features/auth/hooks';
import { useImpersonating } from '@/features/wallet/queries';

/** Not impersonating and the account is active (Phase 20: shared with Settings → Phone numbers). */
export const useActing = (): boolean => {
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

/** Phase 18B: ask many contacts at once (`inbox.reply` + `contacts.read` + `whatsapp.read`). */
export const useCanRequestPermissionBulk = (): boolean => {
  const reply = usePermission('inbox.reply');
  const contacts = usePermission('contacts.read');
  const whatsapp = usePermission('whatsapp.read');
  return useActing() && reply && contacts && whatsapp;
};
