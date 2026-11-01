import { apiClient, unwrap } from './client';
import type { SheetImport, SheetPreview, SuccessEnvelope } from './types';

export type SheetSchedule = SheetImport['schedule'];
export type SheetColumnMapping = SheetPreview['suggestedMapping'][number];

export interface SheetImportInput {
  name: string;
  url: string;
  schedule: SheetSchedule;
  mapping: SheetColumnMapping[];
  updateExisting: boolean;
  tags?: string[];
}

/** `/api/v1/sheet-imports` (Phase 15) — the sheet link is sent, never read back. */
export const sheetImportsApi = {
  list: () => unwrap(apiClient.get<SuccessEnvelope<SheetImport[]>>('/sheet-imports')),
  preview: (url: string) =>
    unwrap(apiClient.post<SuccessEnvelope<SheetPreview>>('/sheet-imports/preview', { url })),
  create: (body: SheetImportInput) =>
    unwrap(apiClient.post<SuccessEnvelope<SheetImport>>('/sheet-imports', body)),
  run: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<SheetImport>>(`/sheet-imports/${id}/run`)),
  remove: async (id: string) => {
    await apiClient.delete(`/sheet-imports/${id}`);
  },
};
