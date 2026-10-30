import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import type { RateCardView } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

/** Phase 12: what one minute of a WhatsApp call your business places costs (selling price). */
export function WhatsAppCallPrices({ prices }: { prices: RateCardView['whatsappCalling'] }) {
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {prices.payer === 'customer'
          ? 'Meta bills WhatsApp calls to your own WhatsApp account; the platform fee below is all we charge.'
          : `Calls your business places are charged in ${String(prices.pulseSec)}-second steps of WhatsApp's talk time. Calls customers make to you are free at WhatsApp.`}
      </Typography>
      <Table size="small" aria-label="WhatsApp call prices">
        <TableHead>
          <TableRow>
            <TableCell>Market</TableCell>
            <TableCell align="right">Per minute</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {prices.markets.map((m) => (
            <TableRow key={m.market}>
              <TableCell component="th" scope="row">
                {m.label}
              </TableCell>
              <TableCell align="right">{formatCurrencyMicros(m.perMinuteMicros)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
