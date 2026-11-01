import type { ColumnChoice } from '@/features/contact-imports/mapping-state';
import type { SheetSchedule } from '@/services/api/sheet-imports';
import type { SheetPreview } from '@/services/api/types';

export const SCHEDULE_LABELS: Record<SheetSchedule, string> = {
  once: 'Once',
  hourly: 'Every hour',
  daily: 'Every day',
};

/** Preview columns → editable choices (existing fields only). */
export const choicesOf = (preview: SheetPreview): ColumnChoice[] =>
  preview.columns.map((col) => {
    const m = preview.suggestedMapping.find((x) => x.index === col.index);
    const target =
      !m || m.target === 'ignore' || m.target === 'new_field'
        ? 'ignore'
        : m.target === 'field'
          ? `field:${m.key ?? ''}`
          : m.target;
    return {
      index: col.index,
      header: col.header,
      samples: col.samples,
      target,
      newKey: '',
      newLabel: '',
      newType: 'text',
      dateFormat: m?.dateFormat ?? 'DMY',
    };
  });
