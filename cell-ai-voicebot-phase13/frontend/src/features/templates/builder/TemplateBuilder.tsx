import Add from '@mui/icons-material/Add';
import ArrowDownward from '@mui/icons-material/ArrowDownward';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import ExpandMore from '@mui/icons-material/ExpandMore';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { enqueueSnackbar } from 'notistack';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';

import { RelativeTime } from '@/components/RelativeTime';
import { toApiError } from '@/services/api/errors';
import type { WhatsAppTemplate, WhatsAppTemplateCategory } from '@/services/api/types';
import { formatBytes } from '@/utils/format';

import { LANGUAGES, TEMPLATE_CATEGORY, templateErrorMessage } from '../labels';
import { HEADER_EXAMPLE_TYPES, TEMPLATE_LIMITS } from '../limits';
import { buildPreview } from '../preview';
import {
  useCreateCallPermissionTemplate,
  useCreateTemplate,
  useEditTemplate,
  useSubmitTemplate,
  useUploadTemplateMedia,
} from '../queries';
import { TemplatePreview } from '../TemplatePreview';
import { errorMap, validateTemplate } from '../validate';
import { placeholdersIn } from '../variables';

import {
  addButton,
  BUTTON_CAPS,
  BUTTON_LABELS,
  bodyKeys,
  canAddButton,
  emptyState,
  fromTemplate,
  insertAt,
  isMediaHeader,
  moveButton,
  nextVariable,
  slugify,
  toComponents,
  type BuilderState,
  type ButtonDraft,
  type ButtonType,
  type HeaderKind,
  type MediaKind,
} from './model';

const CATEGORIES: WhatsAppTemplateCategory[] = ['UTILITY', 'MARKETING'];
const HEADER_OPTIONS: { value: HeaderKind; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document' },
  { value: 'location', label: 'Location' },
];
const BUTTON_TYPES: ButtonType[] = [
  'QUICK_REPLY',
  'URL',
  'PHONE_NUMBER',
  'COPY_CODE',
  'VOICE_CALL',
];
const MEDIA_ACCEPT: Record<MediaKind, readonly string[]> = {
  image: HEADER_EXAMPLE_TYPES.IMAGE,
  video: HEADER_EXAMPLE_TYPES.VIDEO,
  document: HEADER_EXAMPLE_TYPES.DOCUMENT,
};

const strip = (path: string) => path.replace(/^(body|query|params)\./, '');

export interface TemplateBuilderProps {
  open: boolean;
  /** The number whose WABA gets the template (new templates). */
  channelId: string;
  /** Edit this template (draft, or approved / rejected / paused at Meta). */
  template?: WhatsAppTemplate | null;
  /** Prefilled new template (e.g. the call permission template). */
  initial?: BuilderState;
  onClose: () => void;
  onSaved?: (template: WhatsAppTemplate) => void;
}

/** Dialog **Create template** / **Edit template** with a live WhatsApp preview. */
export function TemplateBuilder({
  open,
  channelId,
  template = null,
  initial,
  onClose,
  onSaved,
}: TemplateBuilderProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));
  const [form, setForm] = useState<BuilderState>(() =>
    template ? fromTemplate(template) : (initial ?? emptyState()),
  );
  // a template created by this dialog (a later failure retries on it, never twice)
  const [savedId, setSavedId] = useState<string | null>(template?.id ?? null);
  const [status, setStatus] = useState(template?.status ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [buttonMenu, setButtonMenu] = useState<HTMLElement | null>(null);
  const [newVarName, setNewVarName] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const create = useCreateTemplate();
  const edit = useEditTemplate();
  const submit = useSubmitTemplate();
  const upload = useUploadTemplateMedia();
  const callPermission = useCreateCallPermissionTemplate();

  const isNew = !template;
  const draft = isNew || template.status === 'DRAFT';
  const approved = template?.status === 'APPROVED';
  const permission = form.purpose === 'call_permission';
  const components = useMemo(() => toComponents(form), [form]);
  const clientErrors = useMemo(
    () =>
      errorMap(
        validateTemplate({
          name: form.name,
          language: form.language,
          category: form.category,
          parameterFormat: form.parameterFormat,
          components,
          purpose: form.purpose,
          ttlSeconds: form.ttlSeconds,
        }),
      ),
    [form, components],
  );
  const needsExample =
    isMediaHeader(form.headerKind) &&
    !file &&
    !(template?.headerMedia?.uploaded && fromTemplate(template).headerKind === form.headerKind);
  const err = (path: string): string | undefined =>
    serverErrors[path] ??
    (showAll || (path === 'name' && form.name !== '') ? clientErrors[path] : undefined);
  const exampleError =
    fileError ??
    serverErrors.headerMedia ??
    (showAll && needsExample ? 'Upload an example file' : undefined);
  const keys = bodyKeys(form.body);
  const headerHasVariable = placeholdersIn(form.headerText).length > 0;
  const samples: Record<string, string> = {
    ...form.examples,
    ...(form.parameterFormat === 'named'
      ? { [placeholdersIn(form.headerText)[0] ?? '']: form.headerExample }
      : { header_1: form.headerExample }),
    ...Object.fromEntries(
      form.buttons.map((b, i) => [
        b.type === 'COPY_CODE' ? `copy_code_${String(i)}` : `button_${String(i)}`,
        b.example,
      ]),
    ),
  };
  const preview = buildPreview(components, form.parameterFormat, {
    values: samples,
    headerFileName: file?.name ?? template?.headerMedia?.fileName ?? null,
  });

  const set = (patch: Partial<BuilderState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setServerErrors({});
  };
  const setButton = (id: string, patch: Partial<ButtonDraft>) =>
    set({ buttons: form.buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)) });

  const pickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!picked || !isMediaHeader(form.headerKind)) return;
    const kind = form.headerKind;
    if (!MEDIA_ACCEPT[kind].includes(picked.type)) {
      setFileError(
        kind === 'image'
          ? 'Use a JPEG or PNG image'
          : kind === 'video'
            ? 'Use an MP4 video'
            : 'Use a PDF',
      );
      return;
    }
    const max = TEMPLATE_LIMITS.headerExampleMaxBytes[kind];
    if (picked.size > max) {
      setFileError(`The file is ${formatBytes(picked.size)} — at most ${formatBytes(max)}`);
      return;
    }
    setFileError(null);
    setFile(picked);
  };

  const addVariable = () => {
    const snippet = nextVariable(form.body, form.parameterFormat, newVarName);
    const at = bodyRef.current?.selectionStart ?? form.body.length;
    set({ body: insertAt(form.body, snippet, at).slice(0, TEMPLATE_LIMITS.bodyMax) });
    setNewVarName('');
  };

  const fail = (e: unknown) => {
    const apiError = toApiError(e);
    if (apiError.kind === 'canceled') {
      setFailure('Upload canceled. The template is saved as a draft.');
      return;
    }
    const fields: Record<string, string> = {};
    for (const d of apiError.details) fields[strip(d.path)] = d.message;
    setServerErrors(fields);
    setShowAll(true);
    setFailure(
      apiError.code === 'VALIDATION_ERROR' && apiError.details.length
        ? 'Fix the highlighted fields.'
        : templateErrorMessage(apiError),
    );
  };

  const save = async (andSubmit: boolean) => {
    setShowAll(true);
    setFailure(null);
    if (Object.keys(clientErrors).length || needsExample || fileError) return;
    setBusy(true);
    try {
      let t: WhatsAppTemplate;
      const id = savedId;
      if (permission && !id) {
        t = await callPermission.mutateAsync({
          channelId,
          language: form.language,
          body: form.body,
          submit: andSubmit,
        });
      } else if (!id) {
        t = await create.mutateAsync({
          channelId,
          name: form.name,
          language: form.language,
          category: form.category,
          parameterFormat: form.parameterFormat,
          components: components as WhatsAppTemplate['components'],
          ttlSeconds: form.ttlSeconds,
          // a media header needs its example uploaded before Meta sees it
          submit: andSubmit && !file,
        });
      } else if (status === 'DRAFT') {
        t = await edit.mutateAsync({
          id,
          body: {
            name: form.name,
            language: form.language,
            category: form.category,
            parameterFormat: form.parameterFormat,
            components: components as WhatsAppTemplate['components'],
            ttlSeconds: form.ttlSeconds,
          },
        });
      } else {
        // at Meta: the new example first, then the edit (Meta reviews it again)
        if (file) await uploadFile(id, file);
        t = await edit.mutateAsync({
          id,
          body: {
            ...(approved ? {} : { category: form.category }),
            components: components as WhatsAppTemplate['components'],
            ttlSeconds: form.ttlSeconds,
          },
        });
        finish(t, 'Sent to WhatsApp for review');
        return;
      }
      setSavedId(t.id);
      setStatus(t.status);
      if (file) {
        t = await uploadFile(t.id, file);
        setFile(null);
      }
      if (andSubmit && t.status === 'DRAFT') t = await submit.mutateAsync(t.id);
      finish(t, andSubmit ? 'Sent to WhatsApp for review' : 'Draft saved');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      setProgress(null);
      abort.current = null;
    }
  };

  const uploadFile = async (id: string, f: File) => {
    abort.current = new AbortController();
    setProgress(0);
    const t = await upload.mutateAsync({
      id,
      input: { file: f, fileName: f.name, onProgress: setProgress, signal: abort.current.signal },
    });
    setProgress(null);
    return t;
  };

  const finish = (t: WhatsAppTemplate, message: string) => {
    enqueueSnackbar(message, { variant: 'success' });
    onSaved?.(t);
    onClose();
  };

  const title = permission
    ? 'Create call permission template'
    : isNew
      ? 'Create template'
      : 'Edit template';
  const leftovers = Object.entries(serverErrors).filter(
    ([path]) =>
      !['name', 'language', 'category', 'ttlSeconds', 'headerMedia'].includes(path) &&
      !path.startsWith('components.'),
  );

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="lg"
      fullScreen={fullScreen}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Stack
              spacing={2.5}
              component="form"
              aria-label={title}
              noValidate
              onSubmit={(e) => e.preventDefault()}
            >
              {failure && (
                <Alert severity="error">
                  {failure}
                  {leftovers.map(([path, message]) => (
                    <Box key={path}>{message}</Box>
                  ))}
                </Alert>
              )}
              {approved && template && (
                <Alert severity="info">
                  Approved templates can be edited once a day and{' '}
                  {TEMPLATE_LIMITS.approvedEditsPer30Days} times in 30 days; the category stays.
                  Edits in the last 30 days: {template.editsLast30Days}.
                  {template.nextEditAt && new Date(template.nextEditAt) > new Date() && (
                    <>
                      {' '}
                      Next edit: <RelativeTime value={template.nextEditAt} />.
                    </>
                  )}
                </Alert>
              )}
              {!draft && (
                <Typography variant="body2" color="text.secondary">
                  The name, language and variable format are fixed after submitting. WhatsApp
                  reviews every edit again.
                </Typography>
              )}

              {!permission && (
                <FormControl disabled={approved}>
                  <FormLabel id="tpl-category">Category</FormLabel>
                  <RadioGroup
                    aria-labelledby="tpl-category"
                    value={form.category}
                    onChange={(e) => set({ category: e.target.value as WhatsAppTemplateCategory })}
                  >
                    {CATEGORIES.map((c) => (
                      <FormControlLabel
                        key={c}
                        value={c}
                        control={<Radio />}
                        label={
                          <Box>
                            <Typography variant="body2">{TEMPLATE_CATEGORY[c].label}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {TEMPLATE_CATEGORY[c].description}
                            </Typography>
                          </Box>
                        }
                      />
                    ))}
                  </RadioGroup>
                  <FormHelperText error={Boolean(err('category'))}>
                    {err('category') ??
                      'Authentication (one-time passcode) templates are created in WhatsApp Manager.'}
                  </FormHelperText>
                </FormControl>
              )}

              {isNew && (
                <FormControlLabel
                  control={
                    <Switch
                      checked={permission}
                      onChange={(e) =>
                        set(
                          e.target.checked
                            ? {
                                purpose: 'call_permission',
                                category: 'UTILITY',
                                buttons: [],
                                headerKind: 'none',
                                footer: '',
                              }
                            : { purpose: 'general' },
                        )
                      }
                    />
                  }
                  label="Ask for permission to call on WhatsApp (call permission template)"
                />
              )}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Name"
                  value={form.name}
                  disabled={!draft || permission}
                  onChange={(e) => set({ name: slugify(e.target.value) })}
                  error={Boolean(err('name'))}
                  helperText={
                    err('name') ?? 'Lower-case letters, numbers and _ (e.g. emi_reminder)'
                  }
                  slotProps={{ htmlInput: { maxLength: TEMPLATE_LIMITS.nameMax } }}
                  fullWidth
                  required
                />
                <Autocomplete
                  options={LANGUAGES.map((l) => l.code)}
                  value={form.language}
                  disabled={!draft}
                  disableClearable
                  getOptionLabel={(code) => {
                    const l = LANGUAGES.find((x) => x.code === code);
                    return l ? `${l.label} (${code})` : code;
                  }}
                  onChange={(_e, code) =>
                    set({
                      language: code,
                      ...(permission ? { name: `call_permission_${code.toLowerCase()}` } : {}),
                    })
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Language"
                      error={Boolean(err('language'))}
                      helperText={err('language')}
                    />
                  )}
                  sx={{ minWidth: 220 }}
                />
              </Stack>

              {!permission && (
                <Stack spacing={1}>
                  <FormLabel id="tpl-format">Variables</FormLabel>
                  <ToggleButtonGroup
                    aria-labelledby="tpl-format"
                    exclusive
                    size="small"
                    disabled={!draft}
                    value={form.parameterFormat}
                    onChange={(_e, v: BuilderState['parameterFormat'] | null) => {
                      if (v) set({ parameterFormat: v, examples: {} });
                    }}
                  >
                    <ToggleButton value="positional">Numbered {'{{1}}'}</ToggleButton>
                    <ToggleButton value="named">Named {'{{first_name}}'}</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
              )}

              {!permission && (
                <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Header">
                  <Stack spacing={1.5}>
                    <TextField
                      select
                      label="Header"
                      value={form.headerKind}
                      disabled={!draft && Boolean(template)}
                      onChange={(e) => {
                        setFile(null);
                        setFileError(null);
                        set({ headerKind: e.target.value as HeaderKind });
                      }}
                      error={Boolean(err('components.header.format'))}
                      helperText={
                        err('components.header.format') ??
                        (!draft ? 'To change the header type, create a new template.' : undefined)
                      }
                    >
                      {HEADER_OPTIONS.map((o) => (
                        <MenuItem key={o.value} value={o.value}>
                          {o.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    {form.headerKind === 'text' && (
                      <>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                          <TextField
                            label="Header text"
                            value={form.headerText}
                            onChange={(e) => set({ headerText: e.target.value })}
                            error={Boolean(err('components.header.text'))}
                            helperText={
                              err('components.header.text') ??
                              `${String(form.headerText.length)} / ${String(TEMPLATE_LIMITS.headerTextMax)}`
                            }
                            slotProps={{ htmlInput: { maxLength: TEMPLATE_LIMITS.headerTextMax } }}
                            fullWidth
                          />
                          <Button
                            size="small"
                            disabled={headerHasVariable}
                            onClick={() =>
                              set({
                                headerText: insertAt(
                                  form.headerText,
                                  form.parameterFormat === 'named' ? '{{name}}' : '{{1}}',
                                ).slice(0, TEMPLATE_LIMITS.headerTextMax),
                              })
                            }
                            sx={{ mt: 1, whiteSpace: 'nowrap' }}
                          >
                            Add variable
                          </Button>
                        </Stack>
                        {headerHasVariable && (
                          <TextField
                            label={`Sample for ${placeholdersIn(form.headerText)[0] ?? ''} (header)`}
                            value={form.headerExample}
                            onChange={(e) => set({ headerExample: e.target.value })}
                            error={Boolean(err('components.header.example'))}
                            helperText={
                              err('components.header.example') ??
                              'WhatsApp reviews the template with this value'
                            }
                            required
                          />
                        )}
                      </>
                    )}
                    {isMediaHeader(form.headerKind) && (
                      <Stack spacing={1}>
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                        >
                          <Button
                            component="label"
                            variant="outlined"
                            startIcon={<UploadFileOutlined />}
                            disabled={busy}
                          >
                            {file || template?.headerMedia
                              ? 'Replace example file'
                              : 'Choose example file'}
                            <input
                              hidden
                              type="file"
                              aria-label="Example file"
                              accept={MEDIA_ACCEPT[form.headerKind].join(',')}
                              onChange={pickFile}
                            />
                          </Button>
                          <Typography variant="body2" color="text.secondary">
                            {file
                              ? `${file.name} · ${formatBytes(file.size)}`
                              : template?.headerMedia?.uploaded
                                ? `${template.headerMedia.fileName ?? 'Example'} · uploaded`
                                : `At most ${formatBytes(TEMPLATE_LIMITS.headerExampleMaxBytes[form.headerKind])}`}
                          </Typography>
                        </Stack>
                        {progress !== null && (
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <LinearProgress
                              variant="determinate"
                              value={progress}
                              aria-label="Upload progress"
                              sx={{ flex: 1 }}
                            />
                            <Typography variant="caption">{progress}%</Typography>
                            <Button size="small" onClick={() => abort.current?.abort()}>
                              Cancel upload
                            </Button>
                          </Stack>
                        )}
                        {exampleError && <FormHelperText error>{exampleError}</FormHelperText>}
                      </Stack>
                    )}
                    {form.headerKind === 'location' && (
                      <Typography variant="body2" color="text.secondary">
                        The location is chosen when the template is sent.
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              )}

              <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Message">
                <Stack spacing={1.5}>
                  <TextField
                    label="Message"
                    value={form.body}
                    multiline
                    minRows={4}
                    inputRef={bodyRef}
                    onChange={(e) => set({ body: e.target.value })}
                    error={Boolean(err('components.body.text') ?? err('components.body'))}
                    helperText={
                      err('components.body.text') ??
                      err('components.body') ??
                      `${String(form.body.length)} / ${String(TEMPLATE_LIMITS.bodyMax)}`
                    }
                    slotProps={{ htmlInput: { maxLength: TEMPLATE_LIMITS.bodyMax } }}
                    required
                  />
                  {!permission && (
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      {form.parameterFormat === 'named' && (
                        <TextField
                          size="small"
                          label="Variable name"
                          value={newVarName}
                          onChange={(e) => setNewVarName(slugify(e.target.value))}
                        />
                      )}
                      <Button
                        size="small"
                        startIcon={<Add />}
                        onClick={addVariable}
                        disabled={keys.length >= TEMPLATE_LIMITS.variablesMax}
                      >
                        Add variable
                      </Button>
                    </Stack>
                  )}
                  {keys.map((k) => (
                    <TextField
                      key={k}
                      size="small"
                      label={`Sample for {{${k}}}`}
                      value={form.examples[k] ?? ''}
                      onChange={(e) => set({ examples: { ...form.examples, [k]: e.target.value } })}
                      error={showAll && !form.examples[k]}
                      helperText={showAll && !form.examples[k] ? 'Add a sample value' : undefined}
                      slotProps={{ htmlInput: { maxLength: TEMPLATE_LIMITS.variableValueMax } }}
                      required
                    />
                  ))}
                  {err('components.body.example') && (
                    <FormHelperText error>{err('components.body.example')}</FormHelperText>
                  )}
                </Stack>
              </Paper>

              {!permission && (
                <TextField
                  label="Footer (optional)"
                  value={form.footer}
                  onChange={(e) => set({ footer: e.target.value })}
                  error={Boolean(err('components.footer.text'))}
                  helperText={
                    err('components.footer.text') ??
                    `${String(form.footer.length)} / ${String(TEMPLATE_LIMITS.footerMax)}`
                  }
                  slotProps={{ htmlInput: { maxLength: TEMPLATE_LIMITS.footerMax } }}
                />
              )}

              {!permission && (
                <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Buttons">
                  <Stack spacing={1.5}>
                    <Stack
                      direction="row"
                      sx={{ justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <Typography variant="subtitle2">
                        Buttons ({form.buttons.length} / {TEMPLATE_LIMITS.buttonsMax})
                      </Typography>
                      <Button
                        size="small"
                        startIcon={<Add />}
                        disabled={form.buttons.length >= TEMPLATE_LIMITS.buttonsMax}
                        onClick={(e) => setButtonMenu(e.currentTarget)}
                      >
                        Add button
                      </Button>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Quick replies stay together, before or after the other buttons. Phones show 3
                      buttons; the rest open from &ldquo;See all options&rdquo;.
                    </Typography>
                    {err('components.buttons') && (
                      <FormHelperText error>{err('components.buttons')}</FormHelperText>
                    )}
                    {form.buttons.map((b, i) => (
                      <ButtonRow
                        key={b.id}
                        button={b}
                        index={i}
                        canUp={moveButton(form.buttons, i, -1) !== null}
                        canDown={moveButton(form.buttons, i, 1) !== null}
                        err={err}
                        onChange={(patch) => setButton(b.id, patch)}
                        onMove={(by) => {
                          const next = moveButton(form.buttons, i, by);
                          if (next) set({ buttons: next });
                        }}
                        onRemove={() => set({ buttons: form.buttons.filter((x) => x.id !== b.id) })}
                      />
                    ))}
                  </Stack>
                  <Menu
                    anchorEl={buttonMenu}
                    open={Boolean(buttonMenu)}
                    onClose={() => setButtonMenu(null)}
                  >
                    {BUTTON_TYPES.map((type) => (
                      <MenuItem
                        key={type}
                        disabled={!canAddButton(form.buttons, type)}
                        onClick={() => {
                          setButtonMenu(null);
                          set({ buttons: addButton(form.buttons, type) });
                        }}
                      >
                        {BUTTON_LABELS[type]}
                        {BUTTON_CAPS[type] < TEMPLATE_LIMITS.buttonsMax &&
                          ` (up to ${String(BUTTON_CAPS[type])})`}
                      </MenuItem>
                    ))}
                  </Menu>
                </Paper>
              )}

              <Accordion disableGutters variant="outlined">
                <AccordionSummary expandIcon={<ExpandMore />}>Advanced</AccordionSummary>
                <AccordionDetails>
                  <TextField
                    label="Message expiry (seconds)"
                    type="number"
                    value={form.ttlSeconds ?? ''}
                    onChange={(e) =>
                      set({ ttlSeconds: e.target.value === '' ? null : Number(e.target.value) })
                    }
                    error={Boolean(err('ttlSeconds'))}
                    helperText={
                      err('ttlSeconds') ??
                      "WhatsApp drops the message if it can't deliver it in time (30 seconds – 30 days). Empty = WhatsApp's default."
                    }
                    fullWidth
                  />
                </AccordionDetails>
              </Accordion>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Box sx={{ position: { md: 'sticky' }, top: 0 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Preview with the sample values
              </Typography>
              <TemplatePreview preview={preview} />
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {(isNew || status === 'DRAFT') && (
          <Button onClick={() => void save(false)} disabled={busy}>
            Save draft
          </Button>
        )}
        <Button variant="contained" onClick={() => void save(true)} disabled={busy}>
          Submit for review
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ButtonRow({
  button: b,
  index,
  canUp,
  canDown,
  err,
  onChange,
  onMove,
  onRemove,
}: {
  button: ButtonDraft;
  index: number;
  canUp: boolean;
  canDown: boolean;
  err: (path: string) => string | undefined;
  onChange: (patch: Partial<ButtonDraft>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const at = `components.buttons.${String(index)}`;
  const label = `${BUTTON_LABELS[b.type]} button ${String(index + 1)}`;
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} component="fieldset" aria-label={label}>
      <Stack spacing={1}>
        <Stack direction="row" sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
            {BUTTON_LABELS[b.type]}
          </Typography>
          <IconButton
            size="small"
            aria-label={`Move ${label} up`}
            disabled={!canUp}
            onClick={() => onMove(-1)}
          >
            <ArrowUpward fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label={`Move ${label} down`}
            disabled={!canDown}
            onClick={() => onMove(1)}
          >
            <ArrowDownward fontSize="small" />
          </IconButton>
          <IconButton size="small" aria-label={`Remove ${label}`} onClick={onRemove}>
            <DeleteOutlined fontSize="small" />
          </IconButton>
        </Stack>
        {b.type !== 'COPY_CODE' && (
          <TextField
            size="small"
            label="Button text"
            value={b.text}
            onChange={(e) => onChange({ text: e.target.value })}
            error={Boolean(err(`${at}.text`))}
            helperText={
              err(`${at}.text`) ??
              `${String(b.text.length)} / ${String(TEMPLATE_LIMITS.buttonTextMax)}`
            }
            slotProps={{ htmlInput: { maxLength: TEMPLATE_LIMITS.buttonTextMax } }}
          />
        )}
        {b.type === 'URL' && (
          <>
            <TextField
              size="small"
              label="Website address"
              placeholder="https://"
              value={b.url}
              onChange={(e) => onChange({ url: e.target.value })}
              error={Boolean(err(`${at}.url`))}
              helperText={err(`${at}.url`)}
              slotProps={{ htmlInput: { maxLength: TEMPLATE_LIMITS.urlMax } }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={b.dynamic}
                  onChange={(e) => onChange({ dynamic: e.target.checked })}
                />
              }
              label="Add a variable at the end of the address {{1}}"
            />
            {b.dynamic && (
              <TextField
                size="small"
                label="Example end of the address"
                value={b.example}
                onChange={(e) => onChange({ example: e.target.value })}
                error={Boolean(err(`${at}.example`))}
                helperText={err(`${at}.example`) ?? `${b.url}${b.example || '…'}`}
              />
            )}
          </>
        )}
        {b.type === 'PHONE_NUMBER' && (
          <TextField
            size="small"
            label="Phone number"
            placeholder="+91…"
            value={b.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            error={Boolean(err(`${at}.phone_number`))}
            helperText={err(`${at}.phone_number`) ?? 'With the country code'}
            slotProps={{ htmlInput: { maxLength: TEMPLATE_LIMITS.phoneMax } }}
          />
        )}
        {b.type === 'COPY_CODE' && (
          <TextField
            size="small"
            label="Example code"
            value={b.example}
            onChange={(e) => onChange({ example: e.target.value })}
            error={Boolean(err(`${at}.example`))}
            helperText={err(`${at}.example`) ?? 'The real code is given when sending'}
            slotProps={{ htmlInput: { maxLength: TEMPLATE_LIMITS.copyCodeExampleMax } }}
          />
        )}
      </Stack>
    </Paper>
  );
}
