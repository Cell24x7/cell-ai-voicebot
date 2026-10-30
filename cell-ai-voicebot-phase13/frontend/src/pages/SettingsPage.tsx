import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { lazy, Suspense } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { useCan } from '@/features/auth/hooks';
import { AccountTab } from '@/features/settings/AccountTab';
import { ApiKeysTab } from '@/features/settings/ApiKeysTab';
import { AuditTab } from '@/features/settings/AuditTab';
import { BillingTab } from '@/features/settings/BillingTab';
import { ProfileTab } from '@/features/settings/ProfileTab';
import { SecurityTab } from '@/features/settings/SecurityTab';
import { useHasWallet } from '@/features/wallet/queries';

// the calls tab uses the campaign window field (date-fns tz) → its own chunk
const CallsTab = lazy(async () => ({
  default: (await import('@/features/settings/CallsTab')).CallsTab,
}));

// Phase 14: AI & outcomes
const InsightsSettingsTab = lazy(async () => ({
  default: (await import('@/features/insights/InsightsSettingsTab')).InsightsSettingsTab,
}));
// the inbox tab needs the inbox hooks → its own chunk
const RetentionTab = lazy(async () => ({
  default: (await import('@/features/settings/RetentionTab')).RetentionTab,
}));
const NotificationsTab = lazy(async () => ({
  default: (await import('@/features/settings/NotificationsTab')).NotificationsTab,
}));
const InboxSettingsTab = lazy(async () => ({
  default: (await import('@/features/settings/InboxSettingsTab')).InboxSettingsTab,
}));

const TABS = [
  { key: 'profile', label: 'Profile', Component: ProfileTab },
  { key: 'security', label: 'Security', Component: SecurityTab },
  { key: 'account', label: 'Account', Component: AccountTab, permission: 'account.read' },
  { key: 'calls', label: 'Calls', Component: CallsTab, permission: 'account.read' },
  { key: 'inbox', label: 'Inbox', Component: InboxSettingsTab, permission: 'account.read' },
  { key: 'ai', label: 'AI & outcomes', Component: InsightsSettingsTab, permission: 'account.read' },
  {
    key: 'retention',
    label: 'Data retention',
    Component: RetentionTab,
    permission: 'account.read',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    Component: NotificationsTab,
    permission: 'reports.read',
  },
  { key: 'billing', label: 'Billing details', Component: BillingTab, permission: 'wallet.read' },
  { key: 'api-keys', label: 'API keys', Component: ApiKeysTab, permission: 'apikeys.read' },
  { key: 'audit', label: 'Audit log', Component: AuditTab, permission: 'audit.read' },
];

export function SettingsPage() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const hasWallet = useHasWallet();
  const tabs = TABS.filter(
    (t) => (!t.permission || can(t.permission)) && (t.key !== 'billing' || hasWallet),
  );
  const current = tabs.find((t) => t.key === tab);
  if (!current)
    return <Navigate to={TABS.some((t) => t.key === tab) ? '/403' : '/settings/profile'} replace />;
  return (
    <>
      <PageHeader title="Settings" />
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={current.key}
          onChange={(_e, v: string) => void navigate(`/settings/${v}`)}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Settings sections"
        >
          {tabs.map((t) => (
            <Tab key={t.key} value={t.key} label={t.label} />
          ))}
        </Tabs>
      </Box>
      <Suspense fallback={<Skeleton variant="rounded" height={240} />}>
        <current.Component />
      </Suspense>
    </>
  );
}
