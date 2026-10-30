import type { SvgIconComponent } from '@mui/icons-material';
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import ChatOutlined from '@mui/icons-material/ChatOutlined';
import ContactsOutlined from '@mui/icons-material/ContactsOutlined';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import DomainOutlined from '@mui/icons-material/DomainOutlined';
import ExtensionOutlined from '@mui/icons-material/ExtensionOutlined';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import PhoneInTalkOutlined from '@mui/icons-material/PhoneInTalkOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import RequestQuoteOutlined from '@mui/icons-material/RequestQuoteOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';

export interface NavItem {
  key: string;
  label: string;
  path: string;
  icon: SvgIconComponent;
  /** Hidden without this permission. */
  permission?: string;
  /** Platform superadmins only. */
  platformOnly?: boolean;
  /** Not built yet — hidden until its phase ships. */
  phase?: number;
  /** Shows a count badge (see `Sidebar`). */
  badge?: 'inbox-unread';
}

/** Sidebar menu. Items with `phase` stay hidden until that phase is live. */
export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/', icon: DashboardOutlined },
  {
    key: 'contacts',
    label: 'Contacts',
    path: '/contacts',
    icon: ContactsOutlined,
    permission: 'contacts.read',
    phase: 3,
  },
  {
    key: 'wallet',
    label: 'Wallet',
    path: '/wallet',
    icon: AccountBalanceWalletOutlined,
    permission: 'wallet.read',
    phase: 4,
  },
  {
    key: 'agents',
    label: 'AI agents',
    path: '/agents',
    icon: SmartToyOutlined,
    permission: 'agents.read',
    phase: 5,
  },
  {
    key: 'knowledge',
    label: 'Knowledge',
    path: '/knowledge',
    icon: MenuBookOutlined,
    permission: 'agents.read',
    phase: 5,
  },
  {
    key: 'flows',
    label: 'Call flows',
    path: '/flows',
    icon: AccountTreeOutlined,
    permission: 'flows.read',
    phase: 6,
  },
  {
    key: 'calls',
    label: 'Calls',
    path: '/calls',
    icon: PhoneInTalkOutlined,
    permission: 'calls.read',
    phase: 7,
  },
  {
    key: 'campaigns',
    label: 'Campaigns',
    path: '/campaigns',
    icon: CampaignOutlined,
    permission: 'campaigns.read',
    phase: 8,
  },
  {
    key: 'inbox',
    label: 'Inbox',
    path: '/inbox',
    icon: ForumOutlined,
    permission: 'inbox.read',
    phase: 10,
    badge: 'inbox-unread',
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    path: '/whatsapp',
    icon: ChatOutlined,
    permission: 'whatsapp.read',
    phase: 9,
  },
  {
    key: 'reports',
    label: 'Reports',
    path: '/reports',
    icon: InsightsOutlined,
    permission: 'reports.read',
    phase: 14,
  },
  {
    key: 'integrations',
    label: 'Integrations',
    path: '/integrations',
    icon: ExtensionOutlined,
    permission: 'integrations.manage',
    phase: 15,
  },
  { key: 'team', label: 'Team', path: '/team', icon: GroupOutlined, permission: 'team.read' },
  { key: 'settings', label: 'Settings', path: '/settings/profile', icon: SettingsOutlined },
  {
    key: 'admin',
    label: 'Accounts',
    path: '/admin/accounts',
    icon: DomainOutlined,
    platformOnly: true,
  },
  {
    key: 'admin-billing',
    label: 'Billing',
    path: '/admin/billing',
    icon: ReceiptLongOutlined,
    platformOnly: true,
    phase: 4,
  },
  {
    key: 'admin-whatsapp',
    label: 'WhatsApp setup',
    path: '/admin/whatsapp',
    icon: ForumOutlined,
    platformOnly: true,
    phase: 9,
  },
  {
    key: 'admin-whatsapp-billing',
    label: 'WhatsApp billing',
    path: '/admin/whatsapp-billing',
    icon: RequestQuoteOutlined,
    platformOnly: true,
    phase: 11,
  },
];

/** The phase currently shipped — items of later phases are hidden. */
export const LIVE_PHASE = 14;

export const visibleNavItems = (
  can: (permission: string) => boolean,
  isPlatformAdmin: boolean,
  livePhase = LIVE_PHASE,
): NavItem[] =>
  NAV_ITEMS.filter(
    (item) =>
      (item.phase === undefined || item.phase <= livePhase) &&
      (!item.permission || can(item.permission)) &&
      (!item.platformOnly || isPlatformAdmin),
  );
