import type { UsageSeries } from '@/services/api/types';
import { formatDateOnly } from '@/utils/format';

/** Rows the chart draws (micros; labels `05 Oct`). */
export const usageDataset = (series: UsageSeries['series']) =>
  series.map((d) => ({
    label: formatDateOnly(d.date).slice(0, 6),
    call: d.callMicros,
    ai: d.aiMicros,
    tts: d.ttsMicros,
    whatsapp: d.whatsappMicros,
  }));
