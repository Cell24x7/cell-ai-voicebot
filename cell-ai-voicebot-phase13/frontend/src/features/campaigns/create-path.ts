import type { CampaignType } from '@/features/calls/capabilities';

/** Carry only the selected audience across engines, never a call program or template. */
export const campaignCreatePath = (
  type: CampaignType,
  audience: {
    listIds?: string[];
    segmentId?: string | null;
    contactIds?: string[];
    csvUploadId?: string | null;
  } = {},
): string => {
  const params = new URLSearchParams();
  if (type === 'whatsapp-call') params.set('line', 'whatsapp');
  if (audience.listIds?.length) params.set('listIds', audience.listIds.join(','));
  if (audience.segmentId) params.set('segmentId', audience.segmentId);
  if (audience.contactIds?.length) params.set('contactIds', audience.contactIds.join(','));
  if (type === 'whatsapp' && audience.csvUploadId) params.set('csvUploadId', audience.csvUploadId);
  const pathname = type === 'whatsapp' ? '/campaigns/whatsapp/new' : '/campaigns/new';
  return `${pathname}${params.size ? `?${params}` : ''}`;
};
