import { useQuery } from '@tanstack/react-query';

import { getSystemInfo } from '@/services/api/system';

export const systemKeys = {
  info: ['system', 'info'] as const,
};

/** Backend info. `silent`: the card shows its own error, no global toast. */
export const useSystemInfo = () =>
  useQuery({ queryKey: systemKeys.info, queryFn: getSystemInfo, meta: { silent: true } });
