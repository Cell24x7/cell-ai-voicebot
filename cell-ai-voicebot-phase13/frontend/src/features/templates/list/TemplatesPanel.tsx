import Add from '@mui/icons-material/Add';
import PhoneInTalkOutlined from '@mui/icons-material/PhoneInTalkOutlined';
import Sync from '@mui/icons-material/Sync';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { enqueueSnackbar } from 'notistack';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';

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

type BuilderOpen = {
  channelId: string;
  template: WhatsAppTemplate | null;
  initial?: BuilderState;
} | null;

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
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [details, setDetails] = useState<string | null>(null);
  // Phase 18B: `?create=call_permission[&lang=hi]` (Calling section / permission dialogs)
  const [params, setParams] = useSearchParams();
  const createParam = params.get('create');
  const [builder, setBuilder] = useState<BuilderOpen>(null);
  const [presetAnchor, setPresetAnchor] = useState<HTMLElement | null>(null);
  const numbers = (channels.data?.items ?? []).filter((c) => c.status !== 'disconnected');
  const channelId = params.get('channelId') ?? (numbers.length === 1 ? numbers[0]!.id : '');
  const selected = numbers.find((c) => c.id === channelId);
  const target =
    selected && ['connected', 'action_needed', 'restricted'].includes(selected.status)
      ? selected.id
      : '';
  const selectNumber = (id: string) => {
    setDetails(null);
    setLanguage('');
    setParams((p) => {
      p.set('channelId', id);
      return p;
    });
  };
  useEffect(() => {
    if (
      !params.has('channelId') &&
      channels.data?.items.filter((c) => c.status !== 'disconnected').length === 1
    ) {
      setParams(
        (p) => {
          p.set('channelId', channelId);
          return p;
        },
        { replace: true },
      );
    }
  }, [channelId, params, channels.data, setParams]);
  const activeBuilder =
    builder ??
    (createParam === 'call_permission' && target && canManage
      ? {
          channelId: target,
          template: null,
          initial: callPermissionState(params.get('lang') ?? 'en'),
        }
      : null);
  const closeBuilder = () => {
    setBuilder(null);
    setParams(
      (p) => {
        p.delete('create');
        p.delete('lang');
        return p;
      },
      { replace: true },
    );
  };

  const templates = useTemplates(
    {
      ...(channelId ? { channelId } : {}),
      ...(status ? { status: [status] } : {}),
      ...(category ? { category } : {}),
      ...(q.length >= 1 ? { q } : {}),
    },
    enabled && numbers.length > 0 && (!channelId || Boolean(selected)),
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

  const visibleRows = channelId && !selected ? [] : (templates.data ?? []);
  const rows = visibleRows.filter((t) => !language || t.language === language);
  const languages = [...new Set(visibleRows.map((t) => t.language))].sort();
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
                  disabled={!target}
                  onClick={(e) => setPresetAnchor(e.currentTarget)}
                >
                  Create call permission template
                </Button>
                <Menu
                  anchorEl={presetAnchor}
                  open={Boolean(presetAnchor)}
                  onClose={() => setPresetAnchor(null)}
                >
                  {(
                    [
                      ['en', 'English'],
                      ['hi', 'Hinglish (Hindi)'],
                    ] as const
                  ).map(([lang, label]) => (
                    <MenuItem
                      key={lang}
                      onClick={() => {
                        setPresetAnchor(null);
                        setBuilder({
                          channelId: target,
                          template: null,
                          initial: callPermissionState(lang),
                        });
                      }}
                    >
                      {label}
                    </MenuItem>
                  ))}
                </Menu>
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  disabled={!target}
                  onClick={() => setBuilder({ channelId: target, template: null })}
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
            {
              <TextField
                select
                size="small"
                label="WhatsApp number"
                value={channelId}
                onChange={(e) => selectNumber(e.target.value)}
                sx={{ minWidth: 170 }}
              >
                <MenuItem value="">All WhatsApp numbers</MenuItem>
                {numbers.map((n) => (
                  <MenuItem key={n.id} value={n.id}>
                    {n.label} · {n.phoneE164 ?? 'Number pending'}
                  </MenuItem>
                ))}
              </TextField>
            }
          </Stack>
          <Alert severity="info">
            {target
              ? 'Templates are shared by numbers in the same WhatsApp Business account. Approval and sync use the selected number.'
              : 'Choose a connected WhatsApp number before creating, editing, syncing or submitting a template.'}
          </Alert>
          <DataTable
            aria-label="Templates"
            columns={columns}
            rows={channelId && !selected ? [] : templates.data ? rows : undefined}
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
        channelId={target || null}
        onClose={() => setDetails(null)}
        onEdit={(template) => {
          if (target && template.channelIds.includes(target))
            setBuilder({ channelId: target, template });
        }}
      />
      {activeBuilder && (
        <Suspense fallback={null}>
          <FrozenBuilder
            context={activeBuilder}
            onClose={closeBuilder}
            onSaved={(t) => setDetails(t.id)}
          />
        </Suspense>
      )}
    </Stack>
  );
}

/** Capture the approval sender for the lifetime of an open draft. */
function FrozenBuilder({
  context,
  onClose,
  onSaved,
}: {
  context: NonNullable<BuilderOpen>;
  onClose: () => void;
  onSaved: (template: WhatsAppTemplate) => void;
}) {
  const [initial] = useState(context);
  return (
    <TemplateBuilder
      open
      channelId={initial.channelId}
      template={initial.template}
      {...(initial.initial ? { initial: initial.initial } : {})}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
