import { DataTable, type Column } from '@/components/DataTable';
import type { RateCardVersion } from '@/services/api/types';
import { formatInAccountTz } from '@/utils/datetime';
import { formatCurrencyMicros } from '@/utils/format';
import { formatBps } from '@/utils/money';

const TZ = 'Asia/Kolkata';

/** Rate-card versions, newest first (history is never edited). */
export function RateHistoryTable({
  rows,
  loading,
  error,
  onRetry,
}: {
  rows: RateCardVersion[] | undefined;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
}) {
  const columns: Column<RateCardVersion>[] = [
    { key: 'from', header: 'From (IST)', render: (r) => formatInAccountTz(r.effectiveFrom, TZ) },
    {
      key: 'call',
      header: 'Call / min',
      align: 'right',
      render: (r) =>
        r.inheritsDefault ? 'Platform default' : formatCurrencyMicros(r.callPerMinuteMicros),
    },
    {
      key: 'pulse',
      header: 'Pulse',
      align: 'right',
      render: (r) => (r.inheritsDefault ? '—' : `${r.pulseSeconds} s`),
    },
    {
      key: 'ai',
      header: 'AI / min',
      align: 'right',
      render: (r) => (r.inheritsDefault ? '—' : formatCurrencyMicros(r.aiPerMinuteMicros)),
    },
    {
      key: 'tts',
      header: 'TTS / 1k',
      align: 'right',
      render: (r) => (r.inheritsDefault ? '—' : formatCurrencyMicros(r.ttsPer1kCharsMicros)),
    },
    {
      key: 'aiText',
      header: 'AI text / 1k tok',
      align: 'right',
      render: (r) => (r.inheritsDefault ? '—' : formatCurrencyMicros(r.aiTextPer1kTokensMicros)),
    },
    {
      key: 'embedding',
      header: 'Embeddings / 1k tok',
      align: 'right',
      render: (r) => (r.inheritsDefault ? '—' : formatCurrencyMicros(r.embeddingPer1kTokensMicros)),
    },
    {
      key: 'commission',
      header: 'Commission',
      align: 'right',
      render: (r) => (r.inheritsDefault ? '—' : formatBps(r.commissionBps)),
    },
    {
      key: 'unanswered',
      header: 'Unanswered',
      render: (r) => (r.inheritsDefault ? '—' : r.billUnansweredAttempts ? 'Billed' : 'Free'),
    },
    { key: 'note', header: 'Note', render: (r) => r.note ?? '—' },
  ];
  return (
    <DataTable
      aria-label="Rate history"
      columns={columns}
      rows={rows}
      getRowId={(r) => r.id}
      loading={loading}
      error={error}
      onRetry={onRetry}
      emptyTitle="No changes yet"
      emptyDescription="This account uses the platform default prices."
    />
  );
}
