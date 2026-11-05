import { MenuItem, TextField } from '@mui/material';

import { usePermission } from '@/features/auth/hooks';
import { CAMPAIGN_TYPES, type CampaignType } from '@/features/calls/capabilities';
import { useCanWriteWaCampaigns } from '@/features/whatsapp-campaigns/permissions';

import { useCanWriteCampaigns } from './permissions';

/** Shared by the call and bulk-message wizards; each type keeps its own engine. */
export function CampaignTypeSelect({
  value,
  onChange,
  disabled = false,
  bulkDisabled = false,
}: {
  value: CampaignType;
  onChange: (value: CampaignType) => void;
  disabled?: boolean;
  bulkDisabled?: boolean;
}) {
  const canReadCalls = usePermission('campaigns.read');
  const canReadMessages = usePermission('whatsapp.campaigns.read');
  const canWriteCalls = useCanWriteCampaigns();
  const canWriteMessages = useCanWriteWaCampaigns();
  return (
    <TextField
      select
      label="Campaign type"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as CampaignType)}
      helperText={
        disabled
          ? 'The campaign type is fixed for this saved campaign.'
          : 'Bulk campaigns send approved WhatsApp templates; call campaigns run a flow or AI agent.'
      }
    >
      {CAMPAIGN_TYPES.filter(
        (type) =>
          type.value === value ||
          (type.value === 'whatsapp'
            ? canReadMessages && canWriteMessages
            : canReadCalls && canWriteCalls),
      ).map((type) => (
        <MenuItem
          key={type.value}
          value={type.value}
          disabled={type.value === 'whatsapp' && bulkDisabled}
        >
          {type.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
