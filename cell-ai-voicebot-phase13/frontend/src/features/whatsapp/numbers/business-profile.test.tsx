import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import type * as WhatsAppModule from '@/services/api/whatsapp';
import { whatsappApi } from '@/services/api/whatsapp';
import { signInAs } from '@/test/auth';
import { fakeBusinessProfile } from '@/test/inbox';
import { renderWithProviders } from '@/test/render';

import { BusinessProfileSection } from './BusinessProfileSection';
import { profileProblems, toProfilePatch, verticalLabel, type ProfileDraft } from './profile-form';

vi.mock('@/services/api/whatsapp', async (importOriginal) => ({
  ...(await importOriginal<typeof WhatsAppModule>()),
  whatsappApi: { profile: vi.fn(), updateProfile: vi.fn(), uploadProfilePhoto: vi.fn() },
}));
const api = vi.mocked(whatsappApi);
const http = (message: string) =>
  new ApiError({ status: 422, code: 'VALIDATION_FAILED', message, kind: 'http', details: [] });

const show = () =>
  renderWithProviders({
    routes: [{ path: '/', element: <BusinessProfileSection channelId="wa1" /> }],
  });

beforeEach(() => {
  signInAs('owner');
  api.profile.mockResolvedValue(fakeBusinessProfile());
  api.updateProfile.mockImplementation((_id, patch) =>
    Promise.resolve(fakeBusinessProfile({ about: patch.about ?? 'Loans made simple' })),
  );
  api.uploadProfilePhoto.mockResolvedValue(
    fakeBusinessProfile({ profilePictureUrl: 'https://pp.example/1.jpg' }),
  );
});
afterEach(() => vi.clearAllMocks());

describe('business profile', () => {
  it('edits only the changed fields; validation; save', async () => {
    show();
    const section = screen.getByRole('region', { name: 'Business profile' });
    const about = await within(section).findByRole('textbox', { name: 'About' });
    expect(about).toHaveValue('Loans made simple');
    const save = within(section).getByRole('button', { name: 'Save profile' });
    expect(save).toBeDisabled();
    await userEvent.clear(about);
    expect(within(section).getByText('Required')).toBeInTheDocument();
    expect(save).toBeDisabled();
    await userEvent.type(about, 'Fast loans');
    await userEvent.clear(within(section).getByRole('textbox', { name: 'E-mail' }));
    await userEvent.type(within(section).getByRole('textbox', { name: 'E-mail' }), 'x');
    expect(within(section).getByText('Not an e-mail address')).toBeInTheDocument();
    await userEvent.clear(within(section).getByRole('textbox', { name: 'E-mail' }));
    await userEvent.type(
      within(section).getByRole('textbox', { name: 'Second website' }),
      'ftp://x',
    );
    expect(within(section).getByText('Must start with http:// or https://')).toBeInTheDocument();
    await userEvent.clear(within(section).getByRole('textbox', { name: 'Second website' }));
    await userEvent.type(
      within(section).getByRole('textbox', { name: 'Second website' }),
      'https://b.example',
    );
    await userEvent.click(within(section).getByRole('combobox', { name: 'Category' }));
    await userEvent.click(screen.getByRole('option', { name: 'Retail' }));
    await userEvent.click(save);
    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith('wa1', {
        about: 'Fast loans',
        email: '',
        websites: ['https://example.com', 'https://b.example'],
        vertical: 'RETAIL',
      }),
    );
    expect(await screen.findByText('Business profile saved')).toBeInTheDocument();
  });

  it('photo upload with preview; errors', async () => {
    show();
    const input = await screen.findByLabelText('Profile photo file');
    await userEvent.upload(input, new File(['p'], 'logo.png', { type: 'image/png' }));
    await waitFor(() =>
      expect(api.uploadProfilePhoto).toHaveBeenCalledWith('wa1', expect.any(File)),
    );
    expect(await screen.findByText('Profile photo updated')).toBeInTheDocument();
    api.uploadProfilePhoto.mockRejectedValueOnce(http('Photo must be at least 192 × 192'));
    await userEvent.upload(
      await screen.findByLabelText('Profile photo file'),
      new File(['p'], 'small.png', { type: 'image/png' }),
    );
    expect(await screen.findByText('Photo must be at least 192 × 192')).toBeInTheDocument();
  });

  it('save errors; empty pick', async () => {
    api.updateProfile.mockRejectedValueOnce(http('Meta refused it'));
    show();
    const section = screen.getByRole('region', { name: 'Business profile' });
    await userEvent.type(await within(section).findByRole('textbox', { name: 'Address' }), '!');
    await userEvent.click(within(section).getByRole('button', { name: 'Save profile' }));
    expect(await within(section).findByText('Meta refused it')).toBeInTheDocument();
    fireEvent.change(within(section).getByLabelText('Profile photo file'), {
      target: { files: [] },
    });
    expect(api.uploadProfilePhoto).not.toHaveBeenCalled();
    api.uploadProfilePhoto.mockReturnValueOnce(new Promise(() => undefined));
    await userEvent.upload(
      within(section).getByLabelText('Profile photo file'),
      new File(['p'], 'a.png', { type: 'image/png' }),
    );
    expect(await within(section).findByText('Uploading…')).toBeInTheDocument();
  });

  it('read only for others; empty profile; load error', async () => {
    signInAs('agent');
    api.profile.mockResolvedValueOnce({
      about: null,
      address: null,
      description: null,
      email: null,
      profilePictureUrl: null,
      websites: [],
      vertical: null,
    });
    const v = show();
    const about = await screen.findByRole('textbox', { name: 'About' });
    expect(about).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull();
    expect(screen.queryByLabelText('Profile photo file')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Not set');
    v.unmount();
    api.profile.mockRejectedValueOnce(http('Meta is down'));
    show();
    expect(await screen.findByText('Meta is down')).toBeInTheDocument();
  });

  it('form rules', () => {
    const d: ProfileDraft = {
      about: 'a',
      description: 'x'.repeat(513),
      address: '',
      email: '',
      website1: '',
      website2: '',
      vertical: 'UNDEFINED',
    };
    expect(profileProblems(d)).toEqual({ description: 'At most 512 characters' });
    expect(toProfilePatch({ ...d, description: ' new ', address: 'A' }, d)).toEqual({
      description: 'new',
      address: 'A',
    });
    expect(verticalLabel('PROF_SERVICES')).toBe('Prof services');
    expect(verticalLabel('NOT_A_BIZ')).toBe('Not a business');
  });
});
