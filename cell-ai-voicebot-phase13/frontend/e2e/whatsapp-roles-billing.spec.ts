import { expect, test, type Page } from '@playwright/test';

import { inviteMember } from './contacts';
import { openAdminAccount, signInAsSuperadmin, signUpOwner, type Owner } from './helpers';
import {
  closeWizard,
  connectFakeNumber,
  expectStatus,
  numberCard,
  openNumbers,
  simulateEvent,
  testPhone,
} from './whatsapp';

// Who sees and changes WhatsApp numbers, one number per platform, Meta billing modes
// and the superadmin tools (PHASE_9_PLAN §1m / §1o).
test.describe.configure({ mode: 'serial' });

let owner: Page;
let account: Owner;
const tag = Date.now().toString(36);
const shared = { businessName: `Shared ${tag}`, phone: testPhone(), displayName: 'Shared Line' };
const CHANGES = ['Connect WhatsApp', 'Sync now', 'Rename', 'Disconnect'];

const expectReadOnly = async (page: Page) => {
  await openNumbers(page);
  await expect(numberCard(page, 'Shared Line')).toBeVisible();
  await expect(page.getByText(/Only owners and admins can change WhatsApp numbers/)).toBeVisible();
  for (const name of CHANGES) await expect(page.getByRole('button', { name })).toBeHidden();
};

test.beforeAll(async ({ browser }) => {
  owner = await browser.newPage();
  account = await signUpOwner(owner, 'waroles');
  await openNumbers(owner);
  await connectFakeNumber(owner, shared);
  await closeWizard(owner);
  await expectStatus(owner, 'Shared Line', 'Connected');
});
test.afterAll(async () => {
  await owner.close();
});

test('viewer and manager: numbers read only', async ({ browser }) => {
  const viewer = await inviteMember(owner, browser, 'Viewer', 'Vera Viewer');
  await expectReadOnly(viewer);
  await viewer.close();
  const manager = await inviteMember(owner, browser, 'Manager', 'Mohan Manager');
  await expectReadOnly(manager);
  await manager.close();
});

test('another account connecting the same number → already connected', async ({ browser }) => {
  const other = await (await browser.newContext()).newPage();
  await signUpOwner(other, 'waother');
  await openNumbers(other);
  await connectFakeNumber(other, shared);
  await expect(
    other
      .getByRole('dialog', { name: 'Connect WhatsApp' })
      .getByText('This number is already connected to another account.'),
  ).toBeVisible();
  await closeWizard(other);
  await expect(other.getByText('No WhatsApp number connected yet')).toBeVisible();
  await other.close();
});

test('superadmin: read only while impersonating; Meta billing → customer pays; force disconnect', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const admin = await (await browser.newContext()).newPage();
  await signInAsSuperadmin(admin);
  await openAdminAccount(admin, account.businessName);
  await admin.getByRole('button', { name: 'Impersonate' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Start viewing' }).click();
  await expect(admin.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expectReadOnly(admin);
  await admin.getByRole('button', { name: 'Stop' }).click();

  // the account pays Meta itself from now on
  await openAdminAccount(admin, account.businessName);
  const card = admin.getByRole('region', { name: 'WhatsApp' });
  await expect(
    card.getByRole('table', { name: 'WhatsApp numbers' }).getByText(/Shared Line/),
  ).toBeVisible();
  await card.getByRole('radio', { name: 'Customer pays Meta' }).check();
  await card.getByRole('button', { name: 'Save Meta billing' }).click();
  await expect(admin.getByRole('dialog').getByText(/a credit line can't be removed/)).toBeVisible();
  await admin.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(admin.getByText('Meta billing saved')).toBeVisible();

  // inviting members left the owner on the Team page
  await openNumbers(owner);
  await connectFakeNumber(owner, {
    businessName: `Own Pay ${tag}`,
    phone: testPhone(),
    displayName: 'Own Pay',
  });
  await closeWizard(owner);
  const own = numberCard(owner, 'Own Pay');
  await expect(
    own.getByRole('link', { name: /Add a payment method in WhatsApp Manager/ }),
  ).toBeVisible();
  await expect(
    numberCard(owner, 'Shared Line').getByText('Meta billed to: platform credit line ✓'),
  ).toBeVisible();
  await simulateEvent(owner, 'Own Pay', 'Payment method added');
  await expect(own.getByText('Meta billed to: your WhatsApp Manager payment method ✓')).toBeVisible(
    {
      timeout: 20_000,
    },
  );

  // force disconnect with a reason → the owner's bell + Disconnected
  await openAdminAccount(admin, account.businessName);
  const row = admin
    .getByRole('region', { name: 'WhatsApp' })
    .getByRole('row')
    .filter({ hasText: 'Shared Line' });
  await row.getByRole('button', { name: 'Force disconnect' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Force disconnect Shared Line' });
  await dialog
    .getByLabel('Reason (sent to the account owners)')
    .fill('Spam complaints from customers');
  await dialog.getByRole('button', { name: 'Disconnect' }).click();
  await expect(admin.getByText(/the account owners were told why/)).toBeVisible();

  await owner.reload();
  await expectStatus(owner, 'Shared Line', 'Disconnected');
  await owner.getByRole('button', { name: /^Notifications, \d+ unread$/ }).click();
  await expect(
    owner.getByRole('menu').getByText('WhatsApp number disconnected by the platform team'),
  ).toBeVisible();
  await owner.keyboard.press('Escape');

  // Admin → WhatsApp setup
  await admin.getByRole('link', { name: 'WhatsApp setup' }).click();
  await expect(admin.getByText('http://localhost:5100/api/v1/webhooks/meta')).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Copy Webhook URL' })).toBeVisible();
  await expect(admin.getByText(/✓ Webhook verify token set/)).toBeVisible();
  await expect(admin.getByText('Fake Meta (simulated)')).toBeVisible();
  await admin.close();
});
