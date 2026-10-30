import Add from '@mui/icons-material/Add';
import PhoneInTalkOutlined from '@mui/icons-material/PhoneInTalkOutlined';
import Sync from '@mui/icons-material/Sync';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { enqueueSnackbar } from 'notistack';
import { lazy, Suspense, useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { DataTable, type Column } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { RelativeTime } from '@/components/RelativeTime';
import { useChannels, useWhatsAppConfig } from '@/features/whatsapp/queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { toApiError } from '@/services/api/errors';
import type {
  WhatsAppTemplate,
  WhatsAppTemplateCategory,
  WhatsAppTemplateListItem,
  WhatsAppTemplateStatus,
} from '@/services/api/types';
import { formatNumber } from '@/utils/format';

import type { BuilderState } from '../builder/model';
import { callPermissionState } from '../builder/model';
import {
  languageLabel,
  reasonText,
  TEMPLATE_CATEGORY,
  TEMPLATE_STATUS,
  templateErrorMessage,
} from '../labels';
import {
  useCanManageTemplates,
  useSyncTemplates,
  useTemplateLiveUpdates,
  useTemplates,
} from '../queries';

import { CategoryChip, QualityDot, TemplateStatusChip } from './chips';
import { TemplateDrawer } from './TemplateDrawer';

// the builder is its own chunk (opened on demand)
const TemplateBuilder = lazy(async () => ({
  default: (await import('../builder/TemplateBuilder')).TemplateBuilder,
}));

const READ_ONLY = 'Only owners, admins and managers can create or change templates.';
const STATUS_FILTERS: WhatsAppTemplateStatus[] = [
  'APPROVED',
  'PENDING',
  'DRAFT',
  'REJECTED',
  'PAUSED',
  'DISABLED',
  'FLAGGED',
];

type BuilderOpen = { template: WhatsAppTemplate | null; initial?: BuilderState } | null;

/** Templates tab of the WhatsApp page (region **Templates**). */
export function TemplatesPanel() {
  useTemplateLiveUpdates();
  const config = useWhatsAppConfig();
  const enabled = Boolean(config.data?.enabled);
  const channels = useChannels(enabled);
  const canManage = useCanManageTemplates();
  const sync = useSyncTemplates();
  const [status, setStatus] = useState<WhatsAppTemplateStatus | ''>('');
  const [category, setCategory] = useState<WhatsAppTemplateCategory | ''>('');
  const [language, setLanguage] = useState('');
  const [channelId, setChannelId] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [details, setDetails] = useState<string | null>(null);
  const [builder, setBuilder] = useState<BuilderOpen>(null);

  const numbers = (channels.data?.items ?? []).filter((c) => c.status !== 'disconnected');
  const target = channelId || numbers[0]?.id || '';
  const templates = useTemplates(
    {
      ...(channelId ? { channelId } : {}),
      ...(status ? { status: [status] } : {}),
      ...(category ? { category } : {}),
      ...(q.length >= 1 ? { q } : {}),
    },
    enabled && numbers.length > 0,
  );

  const notSetUp =
    config.data?.enabled === false ||
    (config.isError && toApiError(config.error).code === 'WHATSAPP_NOT_CONFIGURED');
  const body = (() => {
    if (notSetUp)
      return (
        <Alert severity="info">
          WhatsApp isn&apos;t set up on this server. Ask the platform team to configure the Meta
          app.
        </Alert>
      );
    if (config.isError || channels.isError)
      return (
        <Alert severity="error">Couldn&apos;t load the WhatsApp settings. Reload the page.</Alert>
      );
    if (!config.data || !channels.data)
      return <Skeleton height={160} aria-label="Loading templates" />;
    if (!numbers.length)
      return (
        <EmptyState
          title="Connect a WhatsApp number first"
          description="Templates belong to the WhatsApp Business account of a connected number."
          action={
            <Button component={RouterLink} to="/whatsapp/numbers" variant="contained">
              Go to Numbers
            </Button>
          }
        />
      );
    return null;
  })();

  const rows = (templates.data ?? []).filter((t) => !language || t.language === language);
  const languages = [...new Set((templates.data ?? []).map((t) => t.language))].sort();
  const numberLabel = (ids: string[]) =>
    ids.map((id) => numbers.find((n) => n.id === id)?.label ?? '—').join(', ');

  const columns: Column<WhatsAppTemplateListItem>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (t) => (
        <Link
          component="button"
          type="button"
          onClick={() => setDetails(t.id)}
          sx={{ wordBreak: 'break-all', textAlign: 'left' }}
        >
          {t.name}
        </Link>
      ),
    },
    { key: 'language', header: 'Language', render: (t) => languageLabel(t.language) },
    {
      key: 'category',
      header: 'Category',
      render: (t) => <CategoryChip category={t.category} previous={t.previousCategory} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => <TemplateStatusChip status={t.status} reason={reasonText(t.statusReason)} />,
    },
    { key: 'quality', header: 'Quality', render: (t) => <QualityDot quality={t.quality} /> },
    { key: 'number', header: 'Number', render: (t) => numberLabel(t.channelIds) },
    {
      key: 'used',
      header: 'Last used',
      render: (t) => (t.usage.lastSentAt ? <RelativeTime value={t.usage.lastSentAt} /> : 'Never'),
    },
    {
      key: 'usage',
      header: 'Sent · read',
      align: 'right',
      render: (t) => `${formatNumber(t.usage.sent)} · ${formatNumber(t.usage.read)}`,
    },
  ];

  return (
    <Stack spacing={2} component="section" aria-label="Templates">
      {body ?? (
        <>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1}
            sx={{ justifyContent: 'space-between' }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: { md: 'center' } }}>
              Message templates approved by WhatsApp start conversations outside the 24-hour window.
              {canManage ? '' : ` ${READ_ONLY}`}
            </Typography>
            {canManage && (
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                <Button
                  startIcon={<Sync />}
                  disabled={sync.isPending || !target}
                  onClick={() =>
                    sync.mutate(target, {
                      onSuccess: (r) =>
                        enqueueSnackbar(
                          `Templates synced: ${String(r.created)} new, ${String(r.updated)} updated, ${String(r.deleted)} removed`,
                          { variant: 'success' },
                        ),
                      onError: (e) =>
                        enqueueSnackbar(templateErrorMessage(toApiError(e)), { variant: 'error' }),
                    })
                  }
                >
                  Sync now
                </Button>
                <Button
                  startIcon={<PhoneInTalkOutlined />}
                  onClick={() => setBuilder({ template: null, initial: callPermissionState() })}
                >
                  Create call permission template
                </Button>
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() => setBuilder({ template: null })}
                >
                  Create template
                </Button>
              </Stack>
            )}
          </Stack>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ flexWrap: 'wrap', rowGap: 1 }}
          >
            <TextField
              size="small"
              label="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: 200 }}
            />
            <TextField
              select
              size="small"
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as WhatsAppTemplateStatus | '')}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="">All statuses</MenuItem>
              {STATUS_FILTERS.map((s) => (
                <MenuItem key={s} value={s}>
                  {TEMPLATE_STATUS[s].label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value as WhatsAppTemplateCategory | '')}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="">All categories</MenuItem>
              {(Object.keys(TEMPLATE_CATEGORY) as WhatsAppTemplateCategory[]).map((c) => (
                <MenuItem key={c} value={c}>
                  {TEMPLATE_CATEGORY[c].label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="">All languages</MenuItem>
              {languages.map((l) => (
                <MenuItem key={l} value={l}>
                  {languageLabel(l)}
                </MenuItem>
              ))}
            </TextField>
            {numbers.length > 1 && (
              <TextField
                select
                size="small"
                label="Number"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                sx={{ minWidth: 170 }}
              >
                <MenuItem value="">All numbers</MenuItem>
                {numbers.map((n) => (
                  <MenuItem key={n.id} value={n.id}>
                    {n.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
          <DataTable
            aria-label="Templates"
            columns={columns}
            rows={templates.data ? rows : undefined}
            getRowId={(t) => t.id}
            loading={templates.isLoading}
            error={templates.error}
            onRetry={() => void templates.refetch()}
            emptyTitle={
              templates.data?.length ? 'No templates match the filters' : 'No templates yet'
            }
            emptyDescription={
              templates.data?.length
                ? undefined
                : canManage
                  ? 'Create a template, or press Sync now to bring the ones made in WhatsApp Manager.'
                  : READ_ONLY
            }
          />
        </>
      )}
      <TemplateDrawer
        templateId={details}
        canManage={canManage}
        onClose={() => setDetails(null)}
        onEdit={(template) => setBuilder({ template })}
      />
      {builder && target && (
        <Suspense fallback={null}>
          <TemplateBuilder
            open
            channelId={target}
            template={builder.template}
            {...(builder.initial ? { initial: builder.initial } : {})}
            onClose={() => setBuilder(null)}
            onSaved={(t) => setDetails(t.id)}
          />
        </Suspense>
      )}
    </Stack>
  );
}
