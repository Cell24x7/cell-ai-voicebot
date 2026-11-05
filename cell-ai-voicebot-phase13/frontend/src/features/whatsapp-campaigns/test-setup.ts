import { beforeEach, vi } from 'vitest';

import { contactImportsApi } from '@/services/api/contact-imports';
import { contactListsApi } from '@/services/api/contact-lists';
import { contactsApi } from '@/services/api/contacts';
import { customFieldsApi } from '@/services/api/custom-fields';
import { segmentsApi } from '@/services/api/segments';
import { templatesApi } from '@/services/api/templates';
import { whatsappApi } from '@/services/api/whatsapp';
import { waCampaignsApi } from '@/services/api/whatsapp-campaigns';
import { fakeTemplate, fakeTemplateListItem } from '@/test/templates';
import { fakeChannel } from '@/test/whatsapp';
import { fakeWaCampaign, fakeWaEstimate, fakeWaReport } from '@/test/whatsapp-campaigns';

export const api = vi.mocked(waCampaignsApi);
export const offsetPage = <T>(data: T[], total = data.length) => ({
  success: true as const,
  data,
  meta: { page: 1, limit: 50, total, totalPages: Math.ceil(total / 50) },
});

beforeEach(() => {
  vi.resetAllMocks();
  api.list.mockResolvedValue(offsetPage([fakeWaCampaign()]));
  api.get.mockResolvedValue(fakeWaCampaign());
  api.create.mockResolvedValue(fakeWaCampaign());
  api.update.mockResolvedValue(fakeWaCampaign());
  api.estimate.mockResolvedValue(fakeWaEstimate());
  api.start.mockResolvedValue(fakeWaCampaign({ status: 'running' }));
  api.pause.mockResolvedValue(fakeWaCampaign({ status: 'paused', pauseReason: 'user' }));
  api.resume.mockResolvedValue(fakeWaCampaign({ status: 'running' }));
  api.stop.mockResolvedValue(fakeWaCampaign({ status: 'stopped' }));
  api.retryFailed.mockResolvedValue({ retried: 2 });
  api.recipients.mockResolvedValue(offsetPage([]));
  api.report.mockResolvedValue(fakeWaReport());
  vi.mocked(whatsappApi.channels).mockResolvedValue({ items: [fakeChannel()] } as never);
  vi.mocked(templatesApi.list).mockResolvedValue([
    fakeTemplateListItem(),
    fakeTemplateListItem('FLAGGED', 'UTILITY', { id: 'flagged', name: 'flagged_template' }),
  ]);
  vi.mocked(templatesApi.get).mockResolvedValue(
    fakeTemplate('APPROVED', 'UTILITY', [{ type: 'BODY', text: 'Hello {{1}}' }]),
  );
  vi.mocked(contactListsApi.list).mockResolvedValue(
    offsetPage([{ id: 'l1', name: 'November customers' }]) as never,
  );
  vi.mocked(segmentsApi.list).mockResolvedValue([{ id: 's1', name: 'Overdue customers' }] as never);
  vi.mocked(customFieldsApi.list).mockResolvedValue([]);
  vi.mocked(contactsApi.tags).mockResolvedValue([{ tag: 'vip', count: 1 }] as never);
  vi.mocked(contactsApi.list).mockResolvedValue(
    offsetPage([{ id: 'ct1', name: 'Asha', phoneE164: '+919000012345', variables: {} }]) as never,
  );
  vi.mocked(contactsApi.get).mockResolvedValue({
    id: 'ct1',
    name: 'Asha',
    phoneE164: '+919000012345',
    variables: {},
  } as never);
  vi.mocked(contactImportsApi.list).mockResolvedValue(offsetPage([]));
});
