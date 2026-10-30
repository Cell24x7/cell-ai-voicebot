import { Navigate, Outlet, type RouteObject } from 'react-router';

import { AuthBootstrap } from '@/features/auth/AuthBootstrap';
import {
  RedirectIfAuthed,
  RequireAuth,
  RequirePermission,
  RequirePlatformAdmin,
} from '@/features/auth/guards';
import { AppLayout } from '@/layout/AppLayout';
import { AdminAccountDetailPage } from '@/pages/admin/AdminAccountDetailPage';
import { AdminAccountsPage } from '@/pages/admin/AdminAccountsPage';
import { AdminBillingPage } from '@/pages/admin/AdminBillingPage';
import { AgentEditorPage } from '@/pages/agents/AgentEditorPage';
import { AgentsPage } from '@/pages/agents/AgentsPage';
import { KnowledgeDetailPage } from '@/pages/agents/KnowledgeDetailPage';
import { KnowledgePage } from '@/pages/agents/KnowledgePage';
import { NewAgentPage } from '@/pages/agents/NewAgentPage';
import { AcceptInvitePage } from '@/pages/auth/AcceptInvitePage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage';
import { ActivityPage } from '@/pages/contacts/ActivityPage';
import { ContactDetailPage } from '@/pages/contacts/ContactDetailPage';
import { ContactsPage } from '@/pages/contacts/ContactsPage';
import { ImportWizardPage } from '@/pages/contacts/ImportWizardPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ErrorPage } from '@/pages/ErrorPage';
import { FlowSimulationPage } from '@/pages/flows/FlowSimulationPage';
import { FlowsPage } from '@/pages/flows/FlowsPage';
import { FlowVersionsPage } from '@/pages/flows/FlowVersionsPage';
import { NewFlowPage } from '@/pages/flows/NewFlowPage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { TeamPage } from '@/pages/TeamPage';
import { WalletPage } from '@/pages/WalletPage';

/** DEV-only tools — the dynamic import is dropped from production builds. */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/realtime',
        lazy: async () => ({
          Component: (await import('@/pages/dev/RealtimeDevPage')).RealtimeDevPage,
        }),
      },
    ]
  : [];

export const routes: RouteObject[] = [
  {
    element: (
      <AuthBootstrap>
        <Outlet />
      </AuthBootstrap>
    ),
    errorElement: <ErrorPage />,
    children: [
      {
        path: '/login',
        element: (
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        ),
      },
      {
        path: '/signup',
        element: (
          <RedirectIfAuthed>
            <SignupPage />
          </RedirectIfAuthed>
        ),
      },
      {
        path: '/verify-email',
        element: (
          <RedirectIfAuthed>
            <VerifyEmailPage />
          </RedirectIfAuthed>
        ),
      },
      {
        path: '/forgot-password',
        element: (
          <RedirectIfAuthed>
            <ForgotPasswordPage />
          </RedirectIfAuthed>
        ),
      },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/accept-invite', element: <AcceptInvitePage /> },
      {
        // public: the stop link in a report e-mail (Phase 14)
        path: '/report-emails/unsubscribe',
        lazy: async () => ({
          Component: (await import('@/pages/reports/ReportUnsubscribePage')).ReportUnsubscribePage,
        }),
      },
      // public legal pages (no login — Meta app settings, footer links)
      {
        path: '/privacy',
        lazy: async () => ({
          Component: (await import('@/pages/legal/PrivacyPage')).PrivacyPage,
        }),
      },
      {
        path: '/terms',
        lazy: async () => ({
          Component: (await import('@/pages/legal/TermsPage')).TermsPage,
        }),
      },
      {
        path: '/contact',
        lazy: async () => ({
          Component: (await import('@/pages/legal/ContactPage')).ContactPage,
        }),
      },
      {
        // public: Meta's data deletion status page (no login)
        path: '/data-deletion',
        lazy: async () => ({
          Component: (await import('@/pages/DataDeletionPage')).DataDeletionPage,
        }),
      },
      {
        element: (
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        ),
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/403', element: <ForbiddenPage /> },
          {
            path: '/team',
            element: (
              <RequirePermission perm="team.read">
                <TeamPage />
              </RequirePermission>
            ),
          },
          {
            path: '/contacts',
            element: (
              <RequirePermission perm="contacts.read">
                <Outlet />
              </RequirePermission>
            ),
            children: [
              { index: true, element: <Navigate to="/contacts/all" replace /> },
              { path: 'c/:id', element: <ContactDetailPage /> },
              { path: 'activity', element: <ActivityPage /> },
              {
                path: 'import',
                element: (
                  <RequirePermission perm="contacts.import">
                    <ImportWizardPage />
                  </RequirePermission>
                ),
              },
              {
                path: 'import/:jobId',
                element: (
                  <RequirePermission perm="contacts.import">
                    <ImportWizardPage />
                  </RequirePermission>
                ),
              },
              { path: ':tab', element: <ContactsPage /> },
            ],
          },
          {
            path: '/wallet',
            element: (
              <RequirePermission perm="wallet.read">
                <WalletPage />
              </RequirePermission>
            ),
          },
          {
            path: '/agents',
            element: (
              <RequirePermission perm="agents.read">
                <Outlet />
              </RequirePermission>
            ),
            children: [
              { index: true, element: <AgentsPage /> },
              { path: 'new', element: <NewAgentPage /> },
              { path: ':id', element: <Navigate to="basic" replace /> },
              { path: ':id/:tab', element: <AgentEditorPage /> },
            ],
          },
          {
            path: '/knowledge',
            element: (
              <RequirePermission perm="agents.read">
                <Outlet />
              </RequirePermission>
            ),
            children: [
              { index: true, element: <KnowledgePage /> },
              { path: ':id', element: <KnowledgeDetailPage /> },
            ],
          },
          {
            path: '/flows',
            element: (
              <RequirePermission perm="flows.read">
                <Outlet />
              </RequirePermission>
            ),
            children: [
              { index: true, element: <FlowsPage /> },
              { path: 'new', element: <NewFlowPage /> },
              { path: ':id/versions', element: <FlowVersionsPage /> },
              { path: ':id/simulations/:runId', element: <FlowSimulationPage /> },
              {
                // the builder (React Flow) is its own chunk
                path: ':id',
                lazy: async () => ({
                  Component: (await import('@/pages/flows/FlowBuilderPage')).FlowBuilderPage,
                }),
              },
            ],
          },
          {
            path: '/campaigns',
            element: (
              <RequirePermission perm="campaigns.read">
                <Outlet />
              </RequirePermission>
            ),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import('@/pages/campaigns/CampaignsPage')).CampaignsPage,
                }),
              },
              {
                // the dashboard (charts) is its own chunk
                path: ':id',
                lazy: async () => ({
                  Component: (await import('@/pages/campaigns/CampaignDetailPage'))
                    .CampaignDetailPage,
                }),
              },
              {
                element: (
                  <RequirePermission perm="campaigns.write">
                    <Outlet />
                  </RequirePermission>
                ),
                children: [
                  {
                    // the wizard is its own chunk
                    path: 'new',
                    lazy: async () => ({
                      Component: (await import('@/pages/campaigns/CampaignWizardPage'))
                        .CampaignWizardPage,
                    }),
                  },
                  {
                    path: ':id/edit',
                    lazy: async () => ({
                      Component: (await import('@/pages/campaigns/CampaignWizardPage'))
                        .CampaignWizardPage,
                    }),
                  },
                ],
              },
            ],
          },
          {
            path: '/calls',
            element: (
              <RequirePermission perm="calls.read">
                <Outlet />
              </RequirePermission>
            ),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import('@/pages/calls/CallsPage')).CallsPage,
                }),
              },
              {
                path: 'test',
                element: (
                  <RequirePermission perm="calls.trigger">
                    <Outlet />
                  </RequirePermission>
                ),
                children: [
                  {
                    // the tester (audio worklets) is its own chunk
                    index: true,
                    lazy: async () => ({
                      Component: (await import('@/pages/calls/CallTesterPage')).CallTesterPage,
                    }),
                  },
                ],
              },
              {
                path: ':id',
                lazy: async () => ({
                  Component: (await import('@/pages/calls/CallDetailPage')).CallDetailPage,
                }),
              },
            ],
          },
          {
            path: '/reports/:tab?',
            element: (
              <RequirePermission perm="reports.read">
                <Outlet />
              </RequirePermission>
            ),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import('@/pages/reports/ReportsPage')).ReportsPage,
                }),
              },
            ],
          },
          {
            path: '/inbox',
            element: (
              <RequirePermission perm="inbox.read">
                <Outlet />
              </RequirePermission>
            ),
            children: [
              {
                // the Inbox page is its own chunk
                index: true,
                lazy: async () => ({
                  Component: (await import('@/pages/inbox/InboxPage')).InboxPage,
                }),
              },
              {
                path: ':conversationId',
                lazy: async () => ({
                  Component: (await import('@/pages/inbox/InboxPage')).InboxPage,
                }),
              },
            ],
          },
          {
            path: '/whatsapp',
            element: (
              <RequirePermission perm="whatsapp.read">
                <Outlet />
              </RequirePermission>
            ),
            children: [
              { index: true, element: <Navigate to="/whatsapp/numbers" replace /> },
              {
                // the WhatsApp page is its own chunk; the tab follows the URL
                path: 'numbers',
                lazy: async () => ({
                  Component: (await import('@/pages/whatsapp/WhatsAppPage')).WhatsAppPage,
                }),
              },
              {
                path: 'templates',
                lazy: async () => ({
                  Component: (await import('@/pages/whatsapp/WhatsAppPage')).WhatsAppPage,
                }),
              },
            ],
          },
          { path: '/settings', element: <Navigate to="/settings/profile" replace /> },
          { path: '/settings/:tab', element: <SettingsPage /> },
          {
            path: '/admin',
            element: (
              <RequirePlatformAdmin>
                <Outlet />
              </RequirePlatformAdmin>
            ),
            children: [
              { index: true, element: <Navigate to="/admin/accounts" replace /> },
              { path: 'accounts', element: <AdminAccountsPage /> },
              { path: 'accounts/:id', element: <AdminAccountDetailPage /> },
              { path: 'billing', element: <AdminBillingPage /> },
              {
                path: 'whatsapp',
                lazy: async () => ({
                  Component: (await import('@/pages/admin/AdminWhatsAppPage')).AdminWhatsAppPage,
                }),
              },
              {
                path: 'whatsapp-billing',
                lazy: async () => ({
                  Component: (await import('@/pages/admin/AdminWhatsAppBillingPage'))
                    .AdminWhatsAppBillingPage,
                }),
              },
            ],
          },
        ],
      },
      ...devRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
