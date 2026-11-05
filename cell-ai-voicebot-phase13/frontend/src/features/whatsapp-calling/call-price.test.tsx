import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { whatsappCallingApi } from '@/services/api/whatsapp-calling';
import { renderWithProviders } from '@/test/render';

import { CallWithAiDialog } from './live/CallWithAiDialog';

vi.mock('@/services/api/whatsapp-calling', () => ({ whatsappCallingApi: { quote: vi.fn() } }));
vi.mock('./ProgramPicker', () => ({
  ProgramPicker: ({ onChange }: { onChange: (value: { kind: 'agent'; id: string }) => void }) => (
    <button onClick={() => onChange({ kind: 'agent', id: 'agent1' })}>Choose agent</button>
  ),
}));
const quote = vi.mocked(whatsappCallingApi.quote);
const price = {
  channelId: 'wa2',
  contactId: 'k2',
  senderLabel: 'Sales',
  senderPhone: '+919000000002',
  market: 'OTHER',
  callPerMinuteMicros: 2_000_000,
  aiPerMinuteMicros: 6_000_000,
  pulseSec: 6 as const,
};
beforeEach(() => {
  quote.mockReset();
});

it('waits for this sender/contact selling price before allowing the selected AI program to dial', async () => {
  let resolve!: (value: typeof price) => void;
  quote.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const call = vi.fn();
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <CallWithAiDialog
            channelId="wa2"
            contactId="k2"
            contactLabel="Asha"
            phoneE164="+12025550100"
            onCall={call}
            onClose={vi.fn()}
          />
        ),
      },
    ],
  });
  const user = userEvent.setup();
  const dialog = within(screen.getByRole('dialog'));
  const button = dialog.getByRole('button', { name: 'Call with AI' });
  await user.click(dialog.getByRole('button', { name: 'Choose agent' }));
  expect(button).toBeDisabled();
  expect(quote).toHaveBeenCalledWith('wa2', 'k2');
  expect(dialog.getByText('Asha · +12025550100')).toBeVisible();
  act(() => {
    resolve(price);
  });
  expect(await dialog.findByText('WhatsApp from Sales · +919000000002')).toBeVisible();
  await waitFor(() => expect(button).toBeEnabled());
  expect(dialog.getByLabelText('Estimated cost')).toHaveTextContent('₹8');
  await user.click(button);
  expect(call).toHaveBeenCalledWith({ kind: 'agent', id: 'agent1' });
});

it('keeps dial disabled on a quote error and lets the user retry without losing the program', async () => {
  quote.mockRejectedValueOnce(new Error('Price unavailable')).mockResolvedValue(price);
  const close = vi.fn();
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <CallWithAiDialog
            channelId="wa2"
            contactId="k2"
            contactLabel="Asha"
            phoneE164="+12025550100"
            onCall={vi.fn()}
            onClose={close}
          />
        ),
      },
    ],
  });
  const user = userEvent.setup();
  const dialog = within(screen.getByRole('dialog'));
  await user.click(dialog.getByRole('button', { name: 'Choose agent' }));
  expect(await dialog.findByRole('alert')).toBeVisible();
  expect(dialog.getByRole('button', { name: 'Call with AI' })).toBeDisabled();
  await user.click(dialog.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(dialog.getByRole('button', { name: 'Call with AI' })).toBeEnabled());
  expect(quote).toHaveBeenCalledTimes(2);
  await user.click(dialog.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalledOnce();
});
