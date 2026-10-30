import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import type { FlowRun } from '@/services/api/types';

import { outcomeLines } from './labels';

function Section({
  title,
  children,
  defaultExpanded = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  return (
    <Accordion disableGutters defaultExpanded={defaultExpanded} variant="outlined">
      <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
        <Typography variant="subtitle2">{title}</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>{children}</AccordionDetails>
    </Accordion>
  );
}

/** Variables, outcome and trace of a run. */
export function RunDetails({
  run,
  showTrace = true,
  onNode,
}: {
  run: FlowRun;
  showTrace?: boolean;
  onNode?: (id: string) => void;
}) {
  const vars = Object.entries(run.variables);
  const lines = outcomeLines(run.outcome);
  return (
    <>
      <Section title={`Values (${String(vars.length)})`}>
        {vars.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No values.
          </Typography>
        ) : (
          <Table size="small" aria-label="Values">
            <TableBody>
              {vars.map(([k, v]) => (
                <TableRow key={k}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{k}</TableCell>
                  <TableCell>{v || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      <Section title="Outcome" defaultExpanded={run.status === 'ended'}>
        {lines.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing recorded yet.
          </Typography>
        ) : (
          lines.map((l) => (
            <Typography key={l} variant="body2">
              {l}
            </Typography>
          ))
        )}
      </Section>
      {showTrace && run.trace && (
        <Section title={`Trace (${String(run.trace.length)})`}>
          <Table size="small" aria-label="Trace">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Step</TableCell>
                <TableCell>Event</TableCell>
                <TableCell>ms</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {run.trace.map((t) => (
                <TableRow
                  key={t.seq}
                  hover={Boolean(t.nodeId && onNode)}
                  onClick={() => t.nodeId && onNode?.(t.nodeId)}
                  sx={{ cursor: t.nodeId && onNode ? 'pointer' : 'default' }}
                >
                  <TableCell>{t.seq}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{t.nodeId ?? '—'}</TableCell>
                  <TableCell>
                    {t.event}
                    {t.handle ? ` → ${t.handle}` : ''}
                    {t.detail ? ` (${t.detail})` : ''}
                  </TableCell>
                  <TableCell>{t.durationMs ?? ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}
    </>
  );
}
