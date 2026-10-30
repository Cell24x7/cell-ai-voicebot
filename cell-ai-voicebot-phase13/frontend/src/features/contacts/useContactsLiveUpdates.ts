import { useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';

import { useWsEvent } from '@/services/realtime';

import { contactKeys, dndKeys, fieldKeys, listKeys, segmentKeys } from './keys';

const BULK_TEXT: Record<string, string> = {
  add_tags: 'Tags added',
  remove_tags: 'Tags removed',
  add_to_list: 'Added to the list',
  remove_from_list: 'Removed from the list',
  delete: 'Contacts deleted',
  add_to_dnd: 'Added to the do-not-call list',
};

/** Refetches contact data when the server says many contacts changed. */
export const useContactsLiveUpdates = (): void => {
  const queryClient = useQueryClient();
  const refresh = () => {
    for (const key of [
      contactKeys.all,
      listKeys.all,
      segmentKeys.all,
      dndKeys.all,
      fieldKeys.all,
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
  useWsEvent('contacts.changed', refresh);
  useWsEvent('contacts.bulk_completed', (event) => {
    enqueueSnackbar(`${BULK_TEXT[event.data.action] ?? 'Done'}: ${event.data.count} contacts`, {
      variant: 'success',
    });
    refresh();
  });
};
