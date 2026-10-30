import EditOutlined from '@mui/icons-material/EditOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { enqueueSnackbar } from 'notistack';
import { useState, type ChangeEvent } from 'react';

import {
  useSaveWhatsAppRates,
  useImportWhatsAppRates,
  useWhatsAppRates,
} from '@/features/templates/queries';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { WhatsAppRateCardMarket, WhatsAppRateImport } from '@/services/api/types';
import { formatInAccountTz } from '@/utils/datetime';

import { formatRate, formatRateInput, parseRateInput, RATE_FIELDS } from './format';

const IST = 'Asia/Kolkata';
const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  RATE_FIELDS.map(([k, l]) => [k, l] as const),
);

type RateField = (typeof RATE_FIELDS)[number][0];

function MarketsTable({
  markets,
  label,
  onEdit,
}: {
  markets: WhatsAppRateCardMarket[];
  label: string;
  onEdit?: (m: WhatsAppRateCardMarket) => void;
}) {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" aria-label={label}>
        <TableHead>
          <TableRow>
            <TableCell>Market</TableCell>
            <TableCell>Calling codes</TableCell>
            {RATE_FIELDS.map(([k, l]) => (
              <TableCell key={k} align="right">
                {l}
              </TableCell>
            ))}
            {onEdit && <TableCell />}
          </TableRow>
        </TableHead>
        <TableBody>
          {markets.map((m) => (
            <TableRow key={m.market}>
              <TableCell component="th" scope="row">
                {m.label}{' '}
                <Typography component="span" variant="caption" color="text.secondary">
                  {m.market}
                </Typography>
              </TableCell>
              <TableCell>
                {m.callingCodes.length
                  ? m.callingCodes.map((c) => `+${c}`).join(', ')
                  : 'Everything else'}
              </TableCell>
              {RATE_FIELDS.map(([k]) => (
                <TableCell key={k} align="right">
                  {formatRate(m[k])}
                </TableCell>
              ))}
              {onEdit && (
                <TableCell align="right">
                  <IconButton size="small" aria-label={`Edit ${m.label}`} onClick={() => onEdit(m)}>
                    <EditOutlined fontSize="small" />
                  </IconButton>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function DiffView({ preview }: { preview: WhatsAppRateImport }) {
  const diff = preview.diff;
  return (
    <Stack spacing={1.5} component="section" aria-label="Changes">
      {preview.errors.length > 0 && (
        <Alert severity="error">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {preview.errors.length} rows can&apos;t be read
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {preview.errors.map((e) => (
              <li key={`${String(e.row)}-${e.message}`}>
                Row {e.row}: {e.message}
              </li>
            ))}
          </Box>
        </Alert>
      )}
      {!diff ? (
        <Typography variant="body2" color="text.secondary">
          {preview.markets.length} markets — there is no rate card yet to compare with.
        </Typography>
      ) : (
        <>
          <Typography variant="body2">
            {diff.added.length} added · {diff.removed.length} removed · {diff.changed.length} prices
            changed
          </Typography>
          {diff.added.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
              {diff.added.map((m) => (
                <Chip key={m} size="small" color="success" variant="outlined" label={`+ ${m}`} />
              ))}
            </Stack>
          )}
          {diff.removed.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
              {diff.removed.map((m) => (
                <Chip key={m} size="small" color="error" variant="outlined" label={`− ${m}`} />
              ))}
            </Stack>
          )}
          {diff.changed.length > 0 && (
            <Table size="small" aria-label="Changed prices">
              <TableHead>
                <TableRow>
                  <TableCell>Market</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">Old</TableCell>
                  <TableCell align="right">New</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {diff.changed.map((c) => (
                  <TableRow key={`${c.market}-${c.field}`}>
                    <TableCell>{c.market}</TableCell>
                    <TableCell>{FIELD_LABELS[c.field] ?? c.field}</TableCell>
                    <TableCell align="right">{formatRate(c.fromMicros)}</TableCell>
                    <TableCell align="right">{formatRate(c.toMicros)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </Stack>
  );
}

function EditMarketDialog({
  market,
  onClose,
  onSave,
  saving,
}: {
  market: WhatsAppRateCardMarket;
  onClose: () => void;
  onSave: (m: WhatsAppRateCardMarket) => void;
  saving: boolean;
}) {
  const [values, setValues] = useState<Record<RateField, string>>(
    () =>
      Object.fromEntries(RATE_FIELDS.map(([k]) => [k, formatRateInput(market[k])])) as Record<
        RateField,
        string
      >,
  );
  const [touched, setTouched] = useState(false);
  const parsed = RATE_FIELDS.map(([k]) => [k, parseRateInput(values[k])] as const);
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit {market.label}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {parsed.map(([k, r]) => (
            <TextField
              key={k}
              label={`${FIELD_LABELS[k] ?? k} (₹ per message)`}
              value={values[k]}
              onChange={(e) => setValues({ ...values, [k]: e.target.value })}
              error={touched && !r.ok}
              helperText={touched && !r.ok ? r.message : undefined}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={saving}
          onClick={() => {
            setTouched(true);
            if (parsed.some(([, r]) => !r.ok)) return;
            const next = { ...market };
            for (const [k, r] of parsed) if (r.ok) next[k] = r.micros;
            onSave(next);
          }}
        >
          Save rate card
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Rates: Meta's INR card in force, scheduled cards, history, CSV import with a diff, row edits. */
export function RatesTab() {
  const rates = useWhatsAppRates();
  const importRates = useImportWhatsAppRates();
  const save = useSaveWhatsAppRates();
  const [preview, setPreview] = useState<WhatsAppRateImport | null>(null);
  const [fileName, setFileName] = useState('');
  const [effective, setEffective] = useState('');
  const [note, setNote] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [editing, setEditing] = useState<WhatsAppRateCardMarket | null>(null);

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFailure(null);
    setFileName(file.name);
    importRates.mutate(
      { file, fileName: file.name },
      { onSuccess: setPreview, onError: (err) => setFailure(getErrorMessage(toApiError(err))) },
    );
  };
  const saved = (message: string) => {
    enqueueSnackbar(message, { variant: 'success' });
    setPreview(null);
    setEditing(null);
    setEffective('');
    setNote('');
  };
  const effectiveIso = effective ? new Date(effective).toISOString() : undefined;

  if (rates.isPending)
    return <Skeleton variant="rounded" height={240} aria-label="Loading rates" />;
  if (rates.isError) return <Alert severity="error">{getErrorMessage(rates.error)}</Alert>;
  const { current, scheduled, history } = rates.data;

  return (
    <Stack spacing={3}>
      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ justifyContent: 'space-between', mb: 1 }}
          >
            <Box>
              <Typography variant="subtitle1">Rate card in force</Typography>
              {current && (
                <Typography variant="caption" color="text.secondary">
                  Since {formatInAccountTz(current.effectiveFrom, IST)} ·{' '}
                  {current.source === 'meta_csv' ? "Meta's CSV" : 'Edited by hand'}
                  {current.note ? ` · ${current.note}` : ''}
                </Typography>
              )}
            </Box>
            <Button
              component="label"
              variant="contained"
              startIcon={<UploadFileOutlined />}
              disabled={importRates.isPending}
            >
              Import rate card
              <input
                hidden
                type="file"
                accept=".csv,text/csv"
                aria-label="Rate card CSV"
                onChange={pick}
              />
            </Button>
          </Stack>
          {current ? (
            <MarketsTable markets={current.markets} label="Current rates" onEdit={setEditing} />
          ) : (
            <Alert severity="warning">
              No rate card yet — WhatsApp messages use the placeholder rates.
            </Alert>
          )}
        </CardContent>
      </Card>

      {failure && <Alert severity="error">{failure}</Alert>}
      {preview && (
        <Card variant="outlined" component="section" aria-label="Import preview">
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="subtitle1">
                {fileName}: {preview.markets.length} markets
              </Typography>
              <DiffView preview={preview} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Effective from"
                  type="datetime-local"
                  value={effective}
                  onChange={(e) => setEffective(e.target.value)}
                  helperText="Empty = now"
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  label="Note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  fullWidth
                />
              </Stack>
              {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button onClick={() => setPreview(null)}>Discard</Button>
                <Button
                  variant="contained"
                  disabled={save.isPending || !preview.markets.length}
                  onClick={() =>
                    save.mutate(
                      {
                        markets: preview.markets,
                        source: 'meta_csv',
                        note: note.trim() || null,
                        ...(effectiveIso ? { effectiveFrom: effectiveIso } : {}),
                      },
                      { onSuccess: () => saved('Rate card saved') },
                    )
                  }
                >
                  Save rate card
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      {scheduled.length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              Scheduled
            </Typography>
            {scheduled.map((card) => (
              <Box key={card.id} sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  From {formatInAccountTz(card.effectiveFrom, IST)}
                  {card.note ? ` · ${card.note}` : ''}
                </Typography>
                <MarketsTable
                  markets={card.markets}
                  label={`Scheduled rates from ${card.effectiveFrom}`}
                />
              </Box>
            ))}
          </CardContent>
        </Card>
      )}

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            History
          </Typography>
          <Table size="small" aria-label="Rate card history">
            <TableHead>
              <TableRow>
                <TableCell>Effective from</TableCell>
                <TableCell>Source</TableCell>
                <TableCell align="right">Markets</TableCell>
                <TableCell>Note</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{formatInAccountTz(h.effectiveFrom, IST)}</TableCell>
                  <TableCell>{h.source === 'meta_csv' ? "Meta's CSV" : 'By hand'}</TableCell>
                  <TableCell align="right">{h.markets}</TableCell>
                  <TableCell>{h.note ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && current && (
        <EditMarketDialog
          market={editing}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(m) =>
            save.mutate(
              {
                markets: current.markets.map((x) => (x.market === m.market ? m : x)),
                source: 'manual',
                note: `Edited ${m.label}`,
              },
              { onSuccess: () => saved('Rate card saved') },
            )
          }
        />
      )}
    </Stack>
  );
}
