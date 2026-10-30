import EditOutlined from '@mui/icons-material/EditOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
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
  useImportWhatsAppCallingRates,
  useSaveWhatsAppRates,
  useWhatsAppCallingRates,
} from '@/features/templates/queries';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { WhatsAppCallingRateMarket, WhatsAppRateImport } from '@/services/api/types';
import { formatInAccountTz } from '@/utils/datetime';

import { formatRate, formatRateInput, parseRateInput } from './format';

const IST = 'Asia/Kolkata';

function CallingTable({
  markets,
  label,
  onEdit,
}: {
  markets: WhatsAppCallingRateMarket[];
  label: string;
  onEdit?: (m: WhatsAppCallingRateMarket) => void;
}) {
  return (
    <Table size="small" aria-label={label}>
      <TableHead>
        <TableRow>
          <TableCell>Market</TableCell>
          <TableCell>Calling codes</TableCell>
          <TableCell align="right">Per minute</TableCell>
          <TableCell>Volume tiers</TableCell>
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
            <TableCell align="right">{formatRate(m.perMinuteMicros)}</TableCell>
            <TableCell>
              {m.tiers.length
                ? m.tiers
                    .map(
                      (t) =>
                        `${t.fromMinutes.toLocaleString('en-IN')}+ min: ${formatRate(t.perMinuteMicros)}`,
                    )
                    .join(' · ')
                : '—'}
            </TableCell>
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
  );
}

function CallingDiff({ preview }: { preview: WhatsAppRateImport }) {
  const diff = preview.diff;
  return (
    <Stack spacing={1} component="section" aria-label="Changes">
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
      {diff && (
        <>
          <Typography variant="body2">
            {diff.added.length} added · {diff.removed.length} removed · {diff.changed.length}{' '}
            changes
          </Typography>
          {diff.changed
            .filter((c) => c.field === 'perMinuteMicros')
            .map((c) => (
              <Typography key={c.market} variant="body2">
                {c.market}: {formatRate(c.fromMicros)} → {formatRate(c.toMicros)} a minute
              </Typography>
            ))}
        </>
      )}
    </Stack>
  );
}

function EditCallingMarket({
  market,
  saving,
  onSave,
  onClose,
}: {
  market: WhatsAppCallingRateMarket;
  saving: boolean;
  onSave: (m: WhatsAppCallingRateMarket) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(formatRateInput(market.perMinuteMicros));
  const parsed = parseRateInput(value);
  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>Edit {market.label}</DialogTitle>
      <DialogContent>
        <TextField
          sx={{ mt: 1 }}
          label="Per minute (₹)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={!parsed.ok}
          helperText={parsed.ok ? "Meta's base rate before the markup" : parsed.message}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!parsed.ok || saving}
          onClick={() => {
            if (parsed.ok) onSave({ ...market, perMinuteMicros: parsed.micros });
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Calling rates (Phase 12): Meta's INR per-minute card, CSV import with a diff, row edits, history. */
export function CallingRatesTab() {
  const rates = useWhatsAppCallingRates();
  const importRates = useImportWhatsAppCallingRates();
  const save = useSaveWhatsAppRates();
  const [preview, setPreview] = useState<WhatsAppRateImport | null>(null);
  const [fileName, setFileName] = useState('');
  const [note, setNote] = useState('');
  const [effective, setEffective] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [editing, setEditing] = useState<WhatsAppCallingRateMarket | null>(null);
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
  const saved = () => {
    enqueueSnackbar('Calling rate card saved', { variant: 'success' });
    setPreview(null);
    setEditing(null);
    setNote('');
    setEffective('');
  };
  if (rates.isPending)
    return <Skeleton variant="rounded" height={200} aria-label="Loading calling rates" />;
  if (rates.isError) return <Alert severity="error">{getErrorMessage(rates.error)}</Alert>;
  const { current, history } = rates.data;
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
              <Typography variant="subtitle1">Calling rate card in force</Typography>
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
              Import calling rates
              <input
                hidden
                type="file"
                accept=".csv,text/csv"
                aria-label="Calling rate card CSV"
                onChange={pick}
              />
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Business-initiated calls are billed by Meta in 6-second pulses at the base rate of the
            called number&apos;s market; cheaper volume tiers are platform margin.
          </Typography>
          {current ? (
            <CallingTable
              markets={current.callingMarkets}
              label="Current calling rates"
              onEdit={setEditing}
            />
          ) : (
            <Alert severity="warning">
              No calling rate card yet — calls use the placeholder rates.
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
                {fileName}: {preview.callingMarkets.length} markets
              </Typography>
              <CallingDiff preview={preview} />
              {preview.callingMarkets.length > 0 && (
                <CallingTable markets={preview.callingMarkets} label="Imported calling rates" />
              )}
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
                  disabled={save.isPending || !preview.callingMarkets.length}
                  onClick={() =>
                    save.mutate(
                      {
                        kind: 'calling',
                        callingMarkets: preview.callingMarkets,
                        source: 'meta_csv',
                        note: note.trim() || null,
                        ...(effective ? { effectiveFrom: new Date(effective).toISOString() } : {}),
                      },
                      { onSuccess: saved },
                    )
                  }
                >
                  Save calling rates
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            History
          </Typography>
          <Table size="small" aria-label="Calling rate card history">
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
        <EditCallingMarket
          market={editing}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(m) =>
            save.mutate(
              {
                kind: 'calling',
                callingMarkets: current.callingMarkets.map((x) => (x.market === m.market ? m : x)),
                source: 'manual',
                note: `Edited ${m.label}`,
              },
              { onSuccess: saved },
            )
          }
        />
      )}
    </Stack>
  );
}
