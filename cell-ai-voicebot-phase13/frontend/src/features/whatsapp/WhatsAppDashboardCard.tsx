import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';

import { usePermission } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { useCalls } from '@/features/calls/queries';
import { useHasWallet, useWallet } from '@/features/wallet/queries';
import { startOfDayIso, todayInTz } from '@/utils/datetime';
import { formatCurrencyMicros } from '@/utils/format';

import { useCanManageWhatsApp, useChannels, useWhatsAppConfig } from './queries';

const ATTENTION = new Set(['action_needed', 'needs_reconnect', 'restricted']);
const TODAY_LIMIT = 100;

/** Phase 12: "Today: N WhatsApp calls · M missed" (calls.read; the first 100 of the day). */
function TodayCalls({ timezone }: { timezone: string }) {
  const calls = useCalls({
    provider: 'whatsapp',
    from: startOfDayIso(todayInTz(timezone), timezone),
    limit: TODAY_LIMIT,
  });
  const page = calls.data?.pages[0];
  if (!page) return null;
  const rows = page.data;
  const missed = rows.filter(
    (c) => c.direction === 'inbound' && !c.timestamps.answeredAt && c.status !== 'in_progress',
  ).length;
  const count = page.meta.hasMore ? `${String(TODAY_LIMIT)}+` : String(rows.length);
  return (
    <Typography variant="body2" color="text.secondary">
      Today: {count} WhatsApp call{rows.length === 1 && !page.meta.hasMore ? '' : 's'}
      {missed ? ` · ${String(missed)} missed` : ''}
    </Typography>
  );
}

/** Dashboard: "Connect WhatsApp" for managers without a number, else connected / attention counts + this month's WhatsApp spend. */
export function WhatsAppDashboardCard() {
  const config = useWhatsAppConfig();
  const channels = useChannels(Boolean(config.data?.enabled));
  const canManage = useCanManageWhatsApp();
  const hasWallet = useHasWallet();
  const wallet = useWallet();
  const items = channels.data?.items ?? [];
  const timezone = useAuthStore((st) => st.session?.account.timezone ?? 'Asia/Kolkata');
  const canSeeCalls = usePermission('calls.read');
  const calling = items.some((c) => c.calling.status === 'enabled');
  // nothing to show: WhatsApp off on this server, still loading, or nothing a reader could do
  if (!config.data?.enabled || !channels.data || (items.length === 0 && !canManage)) return null;
  const connected = items.filter((c) => c.status === 'connected').length;
  const attention = items.filter((c) => ATTENTION.has(c.status)).length;
  return (
    <Card variant="outlined" sx={{ height: '100%' }} component="section" aria-label="WhatsApp">
      <CardContent>
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}
        >
          <Typography variant="subtitle1">WhatsApp</Typography>
          <Link component={RouterLink} to="/whatsapp/numbers" variant="body2">
            Numbers
          </Link>
        </Stack>
        {items.length === 0 ? (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Connect your WhatsApp Business number to chat, send templates and call customers.
            </Typography>
            <div>
              <Button
                component={RouterLink}
                to="/whatsapp/numbers"
                variant="contained"
                size="small"
              >
                Connect WhatsApp
              </Button>
            </div>
          </Stack>
        ) : (
          <Stack spacing={0.5}>
            <Typography variant="body2">
              {connected} connected
              {attention
                ? ` · ${String(attention)} need${attention === 1 ? 's' : ''} attention`
                : ''}
            </Typography>
            {calling && canSeeCalls && <TodayCalls timezone={timezone} />}
            {hasWallet && wallet.data && (
              <Typography variant="body2" color="text.secondary">
                This month: {formatCurrencyMicros(wallet.data.monthSpend.whatsappMicros)} on
                WhatsApp
              </Typography>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
