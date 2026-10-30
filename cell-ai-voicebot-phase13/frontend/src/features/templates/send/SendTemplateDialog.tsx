import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useMemo, useState, type ChangeEvent } from 'react';

import { useCustomFields } from '@/features/contacts/queries';
import { inboxKeys } from '@/features/inbox/keys';
import { storeMessage } from '@/features/inbox/queries';
import { walletKeys } from '@/features/wallet/keys';
import { toApiError, type ApiError } from '@/services/api/errors';
import { inboxApi } from '@/services/api/inbox';
import type {
  InboxConversationDetail,
  InboxMessage,
  InboxTemplateSend,
  WhatsAppTemplateListItem,
  WhatsAppTemplateVariable,
  WhatsAppVariableSourceKind,
} from '@/services/api/types';
import { formatBytes, formatCurrencyMicros } from '@/utils/format';

import {
  languageLabel,
  MARKETING_BLOCK_TEXT,
  PRICE_CATEGORY_LABELS,
  PRICE_NOTE_TEXT,
  TEMPLATE_CATEGORY,
  templateErrorMessage,
  VARIABLE_SOURCE_LABELS,
} from '../labels';
import { HEADER_EXAMPLE_TYPES, TEMPLATE_LIMITS } from '../limits';
import { buildPreview } from '../preview';
import {
  SENDABLE_TEMPLATE_STATUSES,
  usePricePreview,
  useTemplate,
  useTemplateLiveUpdates,
  useTemplates,
} from '../queries';
import { TemplatePreview } from '../TemplatePreview';
import { headerFormat } from '../variables';

import {
  initialChoices,
  marketingBlock,
  resolveVariable,
  type SendContact,
  type VariableChoice,
} from './resolve';

const SOURCES = Object.keys(VARIABLE_SOURCE_LABELS) as WhatsAppVariableSourceKind[];
const MEDIA_UPLOAD_KIND = { IMAGE: 'image', VIDEO: 'video', DOCUMENT: 'document' } as const;

export type SendTemplateTarget =
  | { kind: 'conversation'; conversationId: string }
  /** Contact page: opens (or creates) the chat with the template. */
  | { kind: 'start' };

export interface SendTemplateDialogProps {
  open: boolean;
  channelId: string;
  contact: SendContact;
  target: SendTemplateTarget;
  onClose: () => void;
  onSent?: (result: { message?: InboxMessage; conversation?: InboxConversationDetail }) => void;
}

const variableLabel = (v: WhatsAppTemplateVariable) =>
  v.component === 'header'
    ? 'Header variable'
    : v.component === 'button'
      ? `Button ${String(v.index + 1)} variable`
      : `{{${v.key}}}`;

/** Why a send was refused, in plain words (marketing reasons from the detail). */
const sendErrorMessage = (e: ApiError): string => {
  if (e.code === 'TEMPLATE_MARKETING_BLOCKED') {
    const reason = e.details[0]?.message ?? '';
    return `${templateErrorMessage(e)} ${MARKETING_BLOCK_TEXT[reason] ?? ''}`.trim();
  }
  return templateErrorMessage(e);
};

/** Dialog **Send template**: template, values per variable, header, preview, cost, send. */
export function SendTemplateDialog({
  open,
  channelId,
  contact,
  target,
  onClose,
  onSent,
}: SendTemplateDialogProps) {
  useTemplateLiveUpdates();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));
  const client = useQueryClient();
  const list = useTemplates({ channelId, status: [...SENDABLE_TEMPLATE_STATUSES] });
  const fields = useCustomFields();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const detail = useTemplate(templateId);
  const template = detail.data && detail.data.id === templateId ? detail.data : null;
  const [choices, setChoices] = useState<Record<string, VariableChoice>>({});
  const [headerSource, setHeaderSource] = useState<'example' | 'upload'>('example');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [location, setLocation] = useState({ latitude: '', longitude: '', name: '', address: '' });
  const [failure, setFailure] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [clientId] = useState(() => crypto.randomUUID());

  const options = (list.data ?? []).filter(
    (t) => t.channelIds.includes(channelId) && SENDABLE_TEMPLATE_STATUSES.includes(t.status),
  );
  const selectedRow = options.find((t) => t.id === templateId) ?? null;
  const price = usePricePreview(
    templateId ? { channelId, contactId: contact.id, templateId } : null,
  );

  const pick = (row: WhatsAppTemplateListItem | null) => {
    setTemplateId(row?.id ?? null);
    setChoices({});
    setFile(null);
    setFileError(null);
    setFailure(null);
    setShowMissing(false);
  };
  // the remembered sources fill in once the full template arrives
  const effective = useMemo(
    () => (template ? { ...initialChoices(template.variables), ...choices } : {}),
    [template, choices],
  );
  const fieldList = useMemo(() => fields.data ?? [], [fields.data]);
  const values = useMemo(
    () =>
      Object.fromEntries(
        (template?.variables ?? []).map((v) => [
          v.key,
          resolveVariable(effective[v.key] ?? { kind: 'ask', value: '' }, contact, fieldList),
        ]),
      ),
    [template, effective, contact, fieldList],
  );
  const missing = (template?.variables ?? []).filter((v) => !values[v.key]);
  const format = template ? headerFormat(template.components) : '';
  const mediaKind =
    format === 'IMAGE' || format === 'VIDEO' || format === 'DOCUMENT'
      ? MEDIA_UPLOAD_KIND[format]
      : null;
  const needsFile =
    mediaKind !== null && (headerSource === 'upload' || !template?.headerMedia?.uploaded);
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  const locationOk =
    location.latitude !== '' &&
    location.longitude !== '' &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;

  const category = template?.category ?? selectedRow?.category ?? null;
  const block = marketingBlock(contact);
  const blocked = block === 'dnd' || (block === 'opted_out' && category === 'MARKETING');

  const send = useMutation({
    meta: { silent: true },
    mutationFn: async () => {
      if (!template) throw new Error('No template');
      let header: InboxTemplateSend['header'];
      if (mediaKind && needsFile && file) {
        setProgress(0);
        const done = await inboxApi.upload({
          file,
          fileName: file.name,
          kind: mediaKind,
          onProgress: setProgress,
        });
        header = { mediaToken: done.mediaToken };
      } else if (format === 'LOCATION') {
        header = {
          location: {
            latitude: lat,
            longitude: lng,
            name: location.name.trim() || null,
            address: location.address.trim() || null,
          },
        };
      }
      const body: InboxTemplateSend = {
        clientId,
        type: 'template',
        templateId: template.id,
        ...(template.variables.length ? { variables: values } : {}),
        ...(header ? { header } : {}),
      };
      if (target.kind === 'conversation') {
        return { message: await inboxApi.send(target.conversationId, body) };
      }
      return {
        conversation: await inboxApi.start({ channelId, contactId: contact.id, template: body }),
      };
    },
    onSuccess: (result) => {
      if (result.message) storeMessage(client, result.message);
      void client.invalidateQueries({ queryKey: inboxKeys.lists });
      void client.invalidateQueries({ queryKey: walletKeys.wallet });
      enqueueSnackbar('Template sent', { variant: 'success' });
      onSent?.(result);
      onClose();
    },
    onError: (e) => setFailure(sendErrorMessage(toApiError(e))),
    onSettled: () => setProgress(null),
  });

  const pickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!picked || !mediaKind) return;
    const allowed = HEADER_EXAMPLE_TYPES[
      format as 'IMAGE' | 'VIDEO' | 'DOCUMENT'
    ] as readonly string[];
    const max = TEMPLATE_LIMITS.headerExampleMaxBytes[mediaKind];
    if (!allowed.includes(picked.type))
      setFileError("WhatsApp doesn't accept this type of file here");
    else if (picked.size > max) setFileError(`At most ${formatBytes(max)}`);
    else {
      setFileError(null);
      setFile(picked);
      return;
    }
    setFile(null);
  };

  const submit = () => {
    setShowMissing(true);
    setFailure(null);
    if (!template || missing.length || blocked) return;
    if (needsFile && !file) return;
    if (format === 'LOCATION' && !locationOk) return;
    send.mutate();
  };

  const preview = template
    ? buildPreview(template.components, template.parameterFormat, {
        values,
        headerFileName: file?.name ?? template.headerMedia?.fileName ?? null,
        locationName: location.name || null,
      })
    : null;

  const costLine = (() => {
    if (!templateId) return null;
    if (price.isPending) return <Skeleton width={260} aria-label="Loading the price" />;
    if (price.isError || !price.data)
      return (
        <Typography variant="body2" color="text.secondary">
          The price couldn&apos;t be loaded. WhatsApp messages are charged from your wallet.
        </Typography>
      );
    const p = price.data;
    return (
      <Stack spacing={0.25} aria-label="Cost">
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {p.payer === 'customer'
            ? 'Billed by Meta to your WhatsApp account'
            : `This message costs ${formatCurrencyMicros(p.priceMicros)} · ${PRICE_CATEGORY_LABELS[p.category] ?? p.category} · ${p.marketLabel}`}
        </Typography>
        {p.payer === 'platform' && (
          <Typography variant="caption" color="text.secondary">
            {PRICE_NOTE_TEXT[p.note]} Free when the customer is in a free entry window.
          </Typography>
        )}
      </Stack>
    );
  })();

  return (
    <Dialog
      open={open}
      onClose={send.isPending ? undefined : onClose}
      fullWidth
      maxWidth="md"
      fullScreen={fullScreen}
    >
      <DialogTitle>Send template</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Stack spacing={2}>
              {failure && <Alert severity="error">{failure}</Alert>}
              <Autocomplete
                options={options}
                value={selectedRow}
                loading={list.isLoading}
                onChange={(_e, row) => pick(row)}
                getOptionLabel={(t) => t.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                noOptionsText="No approved templates for this number"
                renderOption={({ key, ...props }, t) => (
                  <Box component="li" key={key} {...props}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', width: '100%' }}>
                      <Typography variant="body2" sx={{ flex: 1, wordBreak: 'break-all' }}>
                        {t.name}
                      </Typography>
                      <Chip size="small" label={TEMPLATE_CATEGORY[t.category].label} />
                      <Chip size="small" variant="outlined" label={languageLabel(t.language)} />
                    </Stack>
                  </Box>
                )}
                renderInput={(params) => <TextField {...params} label="Template" />}
              />
              {list.isError && (
                <Alert severity="error">{templateErrorMessage(toApiError(list.error))}</Alert>
              )}
              {templateId && !template && !detail.isError && (
                <Skeleton height={120} aria-label="Loading template" />
              )}

              {blocked && (
                <Alert severity="warning">
                  {block === 'dnd'
                    ? `${MARKETING_BLOCK_TEXT.dnd ?? ''} Templates can't be sent to this number.`
                    : `Marketing templates can't be sent to this customer. ${MARKETING_BLOCK_TEXT.opted_out ?? ''}`}
                </Alert>
              )}
              {template?.category === 'MARKETING' && !blocked && (
                <Alert severity="info">
                  Send marketing only to customers who agreed to hear from you on WhatsApp.
                  {contact.consent === null && ' No consent is recorded for this contact.'}
                </Alert>
              )}

              {template?.variables.map((v) => {
                const choice = effective[v.key] ?? { kind: 'ask' as const, value: '' };
                const setChoice = (next: Partial<VariableChoice>) =>
                  setChoices((all) => ({ ...all, [v.key]: { ...choice, ...next } }));
                const resolved = values[v.key] ?? '';
                return (
                  <Stack
                    key={v.key}
                    spacing={1}
                    component="fieldset"
                    aria-label={variableLabel(v)}
                    sx={{ border: 0, p: 0, m: 0 }}
                  >
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <TextField
                        select
                        size="small"
                        label={`${variableLabel(v)} source`}
                        value={choice.kind}
                        onChange={(e) =>
                          setChoice({
                            kind: e.target.value as WhatsAppVariableSourceKind,
                            value: '',
                          })
                        }
                        sx={{ minWidth: 180 }}
                      >
                        {SOURCES.map((k) => (
                          <MenuItem key={k} value={k}>
                            {VARIABLE_SOURCE_LABELS[k]}
                          </MenuItem>
                        ))}
                      </TextField>
                      {choice.kind === 'field' && (
                        <TextField
                          select
                          size="small"
                          label={`Custom field for ${variableLabel(v)}`}
                          value={fieldList.some((f) => f.key === choice.value) ? choice.value : ''}
                          onChange={(e) => setChoice({ value: e.target.value })}
                          sx={{ minWidth: 180 }}
                        >
                          {fieldList.map((f) => (
                            <MenuItem key={f.key} value={f.key}>
                              {f.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                      {(choice.kind === 'static' || choice.kind === 'ask') && (
                        <TextField
                          size="small"
                          label={`Value for ${variableLabel(v)}`}
                          value={choice.value}
                          onChange={(e) => setChoice({ value: e.target.value })}
                          slotProps={{ htmlInput: { maxLength: TEMPLATE_LIMITS.variableValueMax } }}
                          fullWidth
                        />
                      )}
                    </Stack>
                    <Typography
                      variant="caption"
                      color={!resolved && showMissing ? 'error' : 'text.secondary'}
                    >
                      {resolved ? `Sends: ${resolved}` : 'No value for this contact — type one'}
                    </Typography>
                  </Stack>
                );
              })}

              {mediaKind && template && (
                <Stack spacing={1} component="section" aria-label="Header media">
                  <Typography variant="subtitle2">Header {mediaKind}</Typography>
                  {template.headerMedia?.uploaded && (
                    <RadioGroup
                      row
                      value={headerSource}
                      onChange={(e) => setHeaderSource(e.target.value as 'example' | 'upload')}
                    >
                      <FormControlLabel
                        value="example"
                        control={<Radio />}
                        label={`Use the example (${template.headerMedia.fileName ?? 'file'})`}
                      />
                      <FormControlLabel
                        value="upload"
                        control={<Radio />}
                        label="Upload a new file"
                      />
                    </RadioGroup>
                  )}
                  {needsFile && (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <Button component="label" variant="outlined" size="small">
                        Choose file
                        <input
                          hidden
                          type="file"
                          aria-label="Header file"
                          accept={HEADER_EXAMPLE_TYPES[
                            format as 'IMAGE' | 'VIDEO' | 'DOCUMENT'
                          ].join(',')}
                          onChange={pickFile}
                        />
                      </Button>
                      <Typography
                        variant="body2"
                        color={showMissing && !file ? 'error' : 'text.secondary'}
                      >
                        {file
                          ? `${file.name} · ${formatBytes(file.size)}`
                          : 'Choose the file to send'}
                      </Typography>
                    </Stack>
                  )}
                  {fileError && (
                    <Typography variant="caption" color="error">
                      {fileError}
                    </Typography>
                  )}
                  {progress !== null && (
                    <LinearProgress
                      variant="determinate"
                      value={progress}
                      aria-label="Upload progress"
                    />
                  )}
                </Stack>
              )}
              {format === 'LOCATION' && (
                <Stack spacing={1} component="section" aria-label="Header location">
                  <Typography variant="subtitle2">Header location</Typography>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      size="small"
                      label="Latitude"
                      value={location.latitude}
                      onChange={(e) => setLocation({ ...location, latitude: e.target.value })}
                      error={showMissing && !locationOk}
                    />
                    <TextField
                      size="small"
                      label="Longitude"
                      value={location.longitude}
                      onChange={(e) => setLocation({ ...location, longitude: e.target.value })}
                      error={showMissing && !locationOk}
                    />
                  </Stack>
                  <TextField
                    size="small"
                    label="Place name (optional)"
                    value={location.name}
                    onChange={(e) => setLocation({ ...location, name: e.target.value })}
                  />
                  <TextField
                    size="small"
                    label="Address (optional)"
                    value={location.address}
                    onChange={(e) => setLocation({ ...location, address: e.target.value })}
                  />
                </Stack>
              )}
              {costLine}
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            {preview ? (
              <TemplatePreview preview={preview} label="Message preview" />
            ) : (
              <Typography variant="body2" color="text.secondary">
                Choose a template to see the message.
              </Typography>
            )}
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={send.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={!template || send.isPending || blocked}
        >
          Send template
        </Button>
      </DialogActions>
    </Dialog>
  );
}
