import { useQuery } from '@tanstack/react-query';

import { contactListsApi } from '@/services/api/contact-lists';
import { contactsApi } from '@/services/api/contacts';
import { customFieldsApi } from '@/services/api/custom-fields';
import { segmentsApi } from '@/services/api/segments';

import { contactKeys, fieldKeys, listKeys, segmentKeys } from './keys';

/** Custom field definitions in display order. */
export const useCustomFields = (withUsage = false) =>
  useQuery({
    queryKey: fieldKeys.list(withUsage),
    queryFn: () => customFieldsApi.list(withUsage),
    meta: { silent: true },
    // while a field's values are being sealed or opened
    refetchInterval: (query) =>
      query.state.data?.some((f) => f.sensitiveJob?.status === 'running') ? 3_000 : false,
  });

/** Lists for pickers (first 100, newest first). */
export const useListOptions = () =>
  useQuery({
    queryKey: listKeys.list({ limit: 100 }),
    queryFn: () => contactListsApi.list({ limit: 100 }),
    select: (page) => page.data,
    meta: { silent: true },
  });

export const useSegments = (withCounts = false) =>
  useQuery({
    queryKey: segmentKeys.list(withCounts),
    queryFn: () => segmentsApi.list(withCounts),
    meta: { silent: true },
  });

export const useContactTags = () =>
  useQuery({
    queryKey: contactKeys.tags,
    queryFn: () => contactsApi.tags(),
    meta: { silent: true },
  });
