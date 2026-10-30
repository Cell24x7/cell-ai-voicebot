import AddOutlined from '@mui/icons-material/AddOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { toApiError } from '@/services/api/errors';

import { InteractiveContent } from '../chat/MessageCards';
import { inboxErrorMessage } from '../labels';
import { checkUpload, UPLOAD_ACCEPT, type InboxLimits } from '../limits';
import { useUploadMedia } from '../queries';

import {
  emptyBuilder,
  toPreview,
  validateBuilder,
  type BuilderState,
  type HeaderChoice,
  type InteractiveKind,
} from './interactive';

const KINDS: { value: InteractiveKind; label: string }[] = [
  { value: 'buttons', label: 'Buttons' },
  { value: 'list', label: 'List' },
  { value: 'cta_url', label: 'Link button' },
];
const HEADERS: { value: HeaderChoice; label: string }[] = [
  { value: 'none', label: 'No header' },
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Photo' },
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document' },
];

/** Buttons (≤ 3), list (sections / rows) or link button, with a live preview and the API limits. */
export function InteractiveBuilder({
  limits,
  onSend,
  onClose,
}: {
  limits: InboxLimits;
  onSend: (state: BuilderState) => void;
  onClose: () => void;
}) {
  const [s, setS] = useState<BuilderState>(emptyBuilder);
  const [attempted, setAttempted] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const upload = useUploadMedia();
  const errors = validateBuilder(s, limits);
  const invalid = Object.keys(errors).length > 0;
  // "Required" waits for a send attempt; length errors show at once
  const err = (key: string) => {
    const e = errors[key];
    return e && (attempted || (e !== 'Required' && e !== 'Add a file')) ? e : undefined;
  };
  const set = (patch: Partial<BuilderState>) => setS((prev) => ({ ...prev, ...patch }));
  const setSection = (i: number, patch: Partial<BuilderState['sections'][number]>) =>
    set({ sections: s.sections.map((sec, k) => (k === i ? { ...sec, ...patch } : sec)) });
  const rowCount = s.sections.flatMap((sec) => sec.rows).length;
  const headers = s.kind === 'buttons' ? HEADERS : HEADERS.slice(0, 2);
  const mediaKind =
    s.headerType === 'image' || s.headerType === 'video' || s.headerType === 'document'
      ? s.headerType
      : null;

  const pickHeaderFile = async (file: File, mediaKind: 'image' | 'video' | 'document') => {
    const problem = checkUpload(file, mediaKind, limits);
    setFileError(problem);
    if (problem) return;
    try {
      const done = await upload.mutateAsync({ file, fileName: file.name, kind: mediaKind });
      set({ headerMedia: { mediaToken: done.mediaToken, fileName: done.fileName } });
    } catch (e) {
      setFileError(inboxErrorMessage(toApiError(e)));
    }
  };

  // a link is checked once something is typed (or on send)
  const urlError = errors.ctaUrl && (attempted || s.ctaUrl) ? errors.ctaUrl : undefined;
  const counter = (value: string, max: number) => `${String(value.trim().length)} / ${String(max)}`;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="interactive-title">
      <DialogTitle id="interactive-title">Interactive message</DialogTitle>
      <DialogContent>
        <Tabs
          value={s.kind}
          onChange={(_e, kind: InteractiveKind) =>
            set({
              kind,
              headerType: kind === 'buttons' || s.headerType === 'text' ? s.headerType : 'none',
            })
          }
          aria-label="Message kind"
          sx={{ mb: 2 }}
        >
          {KINDS.map((k) => (
            <Tab key={k.value} value={k.value} label={k.label} />
          ))}
        </Tabs>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
          <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
            <TextField
              select
              label="Header"
              value={s.headerType}
              onChange={(e) => {
                set({ headerType: e.target.value as HeaderChoice, headerMedia: null });
                setFileError(null);
              }}
            >
              {headers.map((h) => (
                <MenuItem key={h.value} value={h.value}>
                  {h.label}
                </MenuItem>
              ))}
            </TextField>
            {s.headerType === 'text' && (
              <TextField
                label="Header text"
                value={s.headerText}
                onChange={(e) => set({ headerText: e.target.value })}
                error={Boolean(err('headerText'))}
                helperText={err('headerText') ?? counter(s.headerText, limits.headerTextMax)}
              />
            )}
            {mediaKind && (
              <Stack spacing={1}>
                <Button component="label" variant="outlined" disabled={upload.isPending}>
                  {s.headerMedia ? 'Change file' : 'Choose file'}
                  <input
                    hidden
                    type="file"
                    aria-label="Header file"
                    accept={UPLOAD_ACCEPT[mediaKind]}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void pickHeaderFile(file, mediaKind);
                    }}
                  />
                </Button>
                {upload.isPending && (
                  <LinearProgress
                    variant="determinate"
                    value={upload.progress}
                    aria-label="Uploading header"
                  />
                )}
                {s.headerMedia && (
                  <Typography variant="caption">
                    {s.headerMedia.fileName ?? 'File ready'}
                  </Typography>
                )}
                {(fileError ?? err('headerMedia')) && (
                  <Alert severity="error">{fileError ?? err('headerMedia')}</Alert>
                )}
              </Stack>
            )}
            <TextField
              label="Message"
              multiline
              minRows={3}
              value={s.body}
              onChange={(e) => set({ body: e.target.value })}
              error={Boolean(err('body'))}
              helperText={err('body') ?? counter(s.body, limits.bodyMax)}
            />
            <TextField
              label="Footer (optional)"
              value={s.footer}
              onChange={(e) => set({ footer: e.target.value })}
              error={Boolean(err('footer'))}
              helperText={err('footer') ?? counter(s.footer, limits.footerMax)}
            />

            {s.kind === 'buttons' && (
              <Stack spacing={1}>
                {s.buttons.map((title, i) => (
                  <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                    <TextField
                      fullWidth
                      label={`Button ${String(i + 1)}`}
                      value={title}
                      onChange={(e) =>
                        set({ buttons: s.buttons.map((b, k) => (k === i ? e.target.value : b)) })
                      }
                      error={Boolean(err(`button.${String(i)}`))}
                      helperText={
                        err(`button.${String(i)}`) ?? counter(title, limits.buttonTitleMax)
                      }
                    />
                    <IconButton
                      aria-label={`Remove button ${String(i + 1)}`}
                      disabled={s.buttons.length === 1}
                      onClick={() => set({ buttons: s.buttons.filter((_b, k) => k !== i) })}
                    >
                      <DeleteOutlined />
                    </IconButton>
                  </Stack>
                ))}
                <Button
                  startIcon={<AddOutlined />}
                  disabled={s.buttons.length >= limits.buttonsMax}
                  onClick={() => set({ buttons: [...s.buttons, ''] })}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Add button
                </Button>
              </Stack>
            )}

            {s.kind === 'list' && (
              <Stack spacing={2}>
                <TextField
                  label="Menu button text"
                  value={s.listButton}
                  onChange={(e) => set({ listButton: e.target.value })}
                  error={Boolean(err('listButton'))}
                  helperText={err('listButton') ?? counter(s.listButton, limits.listButtonMax)}
                />
                {s.sections.map((sec, i) => (
                  <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', mb: 1 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label={`Section ${String(i + 1)} title${s.sections.length > 1 ? '' : ' (optional)'}`}
                        value={sec.title}
                        onChange={(e) => setSection(i, { title: e.target.value })}
                        error={Boolean(err(`section.${String(i)}`))}
                        helperText={err(`section.${String(i)}`)}
                      />
                      <IconButton
                        aria-label={`Remove section ${String(i + 1)}`}
                        disabled={s.sections.length === 1}
                        onClick={() => set({ sections: s.sections.filter((_x, k) => k !== i) })}
                      >
                        <DeleteOutlined />
                      </IconButton>
                    </Stack>
                    {sec.rows.map((row, j) => (
                      <Stack
                        key={j}
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: 'flex-start', mb: 1 }}
                      >
                        <TextField
                          size="small"
                          label={`Row ${String(j + 1)}`}
                          value={row.title}
                          onChange={(e) =>
                            setSection(i, {
                              rows: sec.rows.map((r, k) =>
                                k === j ? { ...r, title: e.target.value } : r,
                              ),
                            })
                          }
                          error={Boolean(err(`row.${String(i)}.${String(j)}`))}
                          helperText={
                            err(`row.${String(i)}.${String(j)}`) ??
                            counter(row.title, limits.rowTitleMax)
                          }
                        />
                        <TextField
                          size="small"
                          sx={{ flex: 1 }}
                          label="Description (optional)"
                          value={row.description}
                          onChange={(e) =>
                            setSection(i, {
                              rows: sec.rows.map((r, k) =>
                                k === j ? { ...r, description: e.target.value } : r,
                              ),
                            })
                          }
                          error={Boolean(err(`rowDescription.${String(i)}.${String(j)}`))}
                          helperText={err(`rowDescription.${String(i)}.${String(j)}`)}
                        />
                        <IconButton
                          aria-label={`Remove row ${String(j + 1)} of section ${String(i + 1)}`}
                          disabled={sec.rows.length === 1}
                          onClick={() =>
                            setSection(i, { rows: sec.rows.filter((_r, k) => k !== j) })
                          }
                        >
                          <DeleteOutlined />
                        </IconButton>
                      </Stack>
                    ))}
                    <Button
                      size="small"
                      startIcon={<AddOutlined />}
                      disabled={rowCount >= limits.listRowsMax}
                      onClick={() =>
                        setSection(i, { rows: [...sec.rows, { title: '', description: '' }] })
                      }
                    >
                      Add row
                    </Button>
                  </Box>
                ))}
                <Button
                  startIcon={<AddOutlined />}
                  disabled={
                    s.sections.length >= limits.listSectionsMax || rowCount >= limits.listRowsMax
                  }
                  onClick={() =>
                    set({
                      sections: [
                        ...s.sections,
                        { title: '', rows: [{ title: '', description: '' }] },
                      ],
                    })
                  }
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Add section
                </Button>
                <Typography variant="caption" color="text.secondary">
                  {rowCount} / {limits.listRowsMax} rows
                </Typography>
              </Stack>
            )}

            {s.kind === 'cta_url' && (
              <Stack spacing={2}>
                <TextField
                  label="Button text"
                  value={s.ctaText}
                  onChange={(e) => set({ ctaText: e.target.value })}
                  error={Boolean(err('ctaText'))}
                  helperText={err('ctaText') ?? counter(s.ctaText, limits.ctaTextMax)}
                />
                <TextField
                  label="Link"
                  placeholder="https://"
                  value={s.ctaUrl}
                  onChange={(e) => set({ ctaUrl: e.target.value })}
                  error={Boolean(urlError)}
                  helperText={urlError ?? 'Only https:// links'}
                />
              </Stack>
            )}
          </Stack>
          <Box sx={{ width: { md: 300 }, flexShrink: 0 }}>
            <Typography variant="overline" color="text.secondary">
              Preview
            </Typography>
            <Box
              aria-label="Preview"
              role="figure"
              sx={{ p: 1.5, borderRadius: 2, boxShadow: 1, bgcolor: 'background.paper' }}
            >
              <InteractiveContent interactive={toPreview(s)} />
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={upload.isPending}
          onClick={() => {
            setAttempted(true);
            if (!invalid) onSend(s);
          }}
        >
          Send
        </Button>
      </DialogActions>
    </Dialog>
  );
}
