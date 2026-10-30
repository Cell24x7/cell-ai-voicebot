import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useSearchParams } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { CallingRatesTab } from '@/features/whatsapp-billing/CallingRatesTab';
import { RatesTab } from '@/features/whatsapp-billing/RatesTab';
import { MarginTab, ReconciliationTab } from '@/features/whatsapp-billing/ReportsTabs';
import { SettingsTab } from '@/features/whatsapp-billing/SettingsTab';

const TABS = [
  { key: 'rates', label: 'Rates', Component: RatesTab },
  { key: 'calling', label: 'Calling rates', Component: CallingRatesTab },
  { key: 'settings', label: 'Settings', Component: SettingsTab },
  { key: 'margin', label: 'Margin', Component: MarginTab },
  { key: 'reconciliation', label: 'Reconciliation', Component: ReconciliationTab },
] as const;

/** `/admin/whatsapp-billing` — Meta's rate card, the markup and what WhatsApp messages earn (superadmin). */
export function AdminWhatsAppBillingPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get('tab')) ?? TABS[0];
  const { Component } = tab;
  return (
    <>
      <PageHeader
        title="WhatsApp billing"
        subtitle="Meta's rate cards, the markup and what WhatsApp messages and calls earn."
      />
      <Tabs
        value={tab.key}
        onChange={(_e, key: string) => setParams({ tab: key })}
        sx={{ mb: 2 }}
        variant="scrollable"
        aria-label="WhatsApp billing sections"
      >
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} />
        ))}
      </Tabs>
      <Component />
    </>
  );
}
