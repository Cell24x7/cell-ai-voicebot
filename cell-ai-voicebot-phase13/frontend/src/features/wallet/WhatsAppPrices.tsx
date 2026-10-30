import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import type { WalletWhatsAppPrices } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

const CATEGORIES = ['marketing', 'utility', 'authentication', 'service'] as const;
const LABELS = {
  marketing: 'Marketing',
  utility: 'Utility',
  authentication: 'Authentication',
  service: 'Service reply',
} as const;

/** Wallet → **WhatsApp prices**: what one delivered message costs per market (selling prices only). */
export function WhatsAppPrices({ prices }: { prices: WalletWhatsAppPrices }) {
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {prices.payer === 'customer'
          ? 'Meta bills WhatsApp messages to your own WhatsApp account; the platform fee below is all we charge.'
          : 'Charged per message WhatsApp delivers. The first 1,000 service replies each month and replies in a free entry window are free.'}
      </Typography>
      <Table size="small" aria-label="WhatsApp prices">
        <TableHead>
          <TableRow>
            <TableCell>Market</TableCell>
            {CATEGORIES.map((c) => (
              <TableCell key={c} align="right">
                {LABELS[c]}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {prices.markets.map((m) => (
            <TableRow key={m.market}>
              <TableCell component="th" scope="row">
                {m.label}
              </TableCell>
              {CATEGORIES.map((c) => (
                <TableCell key={c} align="right">
                  {formatCurrencyMicros(m.prices[c])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
