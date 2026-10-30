import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { reportsApi, type ReportQuery, type ReportTab } from '@/services/api/reports';

export const reportKeys = {
  all: ['reports'] as const,
  report: (tab: ReportTab, query: ReportQuery) => ['reports', tab, query] as const,
};

/** One report tab; the previous data stays while a filter change loads. */
export const useReport = (tab: ReportTab, query: ReportQuery, enabled = true) =>
  useQuery({
    queryKey: reportKeys.report(tab, query),
    queryFn: () => reportsApi.get(tab, query),
    enabled,
    placeholderData: keepPreviousData,
    // the backend caches 60 s; refetch when the page comes back
    staleTime: 60_000,
  });
