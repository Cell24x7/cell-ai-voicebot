import CircularProgress from '@mui/material/CircularProgress';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { lazy, Suspense } from 'react';
import { Link, useLocation } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { NumbersPanel } from '@/features/whatsapp/numbers/NumbersPanel';

// the templates tab (list, drawer, builder) is its own chunk
const TemplatesPanel = lazy(async () => ({
  default: (await import('@/features/templates/list/TemplatesPanel')).TemplatesPanel,
}));

type WhatsAppTab = 'numbers' | 'templates';

/** `/whatsapp/numbers` and `/whatsapp/templates` — the tab follows the URL. */
export function WhatsAppPage() {
  const { pathname } = useLocation();
  const tab: WhatsAppTab = pathname.startsWith('/whatsapp/templates') ? 'templates' : 'numbers';
  return (
    <>
      <PageHeader
        title="WhatsApp"
        subtitle="Connect WhatsApp Business numbers and manage message templates."
      />
      <Tabs value={tab} sx={{ mb: 2 }} aria-label="WhatsApp sections">
        <Tab label="Numbers" value="numbers" component={Link} to="/whatsapp/numbers" />
        <Tab label="Templates" value="templates" component={Link} to="/whatsapp/templates" />
      </Tabs>
      {tab === 'numbers' ? (
        <NumbersPanel />
      ) : (
        <Suspense fallback={<CircularProgress aria-label="Loading templates" />}>
          <TemplatesPanel />
        </Suspense>
      )}
    </>
  );
}
