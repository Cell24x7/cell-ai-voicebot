import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { Navigate, useNavigate, useParams } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { useCan } from '@/features/auth/hooks';
import { AfterCallTab } from '@/features/integrations/after-call/AfterCallTab';
import { SheetsTab } from '@/features/integrations/sheets/SheetsTab';
import { WebhooksTab } from '@/features/integrations/webhooks/WebhooksTab';

const TABS = [
  { key: 'webhooks', label: 'Webhooks', Component: WebhooksTab, permission: 'integrations.manage' },
  {
    key: 'after-call',
    label: 'After the call',
    Component: AfterCallTab,
    permission: 'integrations.manage',
  },
  { key: 'sheets', label: 'Google Sheets', Component: SheetsTab, permission: 'contacts.import' },
] as const;

/** `/integrations/:tab?` (Phase 15): webhooks, after-the-call rules, Google-Sheet imports. */
export function IntegrationsPage() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const tabs = TABS.filter((t) => can(t.permission));
  const current = tab ? tabs.find((t) => t.key === tab) : tabs[0];
  if (!current) {
    return (
      <Navigate
        to={tab && TABS.some((t) => t.key === tab) ? '/403' : `/integrations/${tabs[0]?.key ?? ''}`}
        replace
      />
    );
  }
  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Connect NotifyNow to your own systems: webhooks, WhatsApp after calls and Google Sheets."
      />
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={current.key}
          onChange={(_e, v: string) => void navigate(`/integrations/${v}`)}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Integrations sections"
        >
          {tabs.map((t) => (
            <Tab key={t.key} value={t.key} label={t.label} />
          ))}
        </Tabs>
      </Box>
      <current.Component />
    </>
  );
}
