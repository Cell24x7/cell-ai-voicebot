import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import type { DraftNode, FlowNodeCatalogEntry } from '@/services/api/types';

import { NODE_ICONS } from './icons';

/** Right panel for the selected step: name, delete and the step's settings form. */
export function Inspector({
  node,
  entry,
  readOnly,
  onLabel,
  onDelete,
  children,
}: {
  node: DraftNode;
  entry: FlowNodeCatalogEntry | undefined;
  readOnly: boolean;
  onLabel: (label: string) => void;
  onDelete: () => void;
  children?: ReactNode;
}) {
  const Icon = NODE_ICONS[node.type];
  return (
    <Box
      component="aside"
      aria-label="Step settings"
      sx={{ width: 340, borderLeft: 1, borderColor: 'divider', overflowY: 'auto', p: 2 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <Icon color="action" />
        <Typography variant="subtitle1" sx={{ flex: 1 }}>
          {entry?.label ?? node.type}
        </Typography>
        {!readOnly && node.type !== 'start' && (
          <Button
            size="small"
            color="error"
            startIcon={<DeleteOutlineOutlined />}
            onClick={onDelete}
          >
            Delete
          </Button>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {entry?.description}
      </Typography>
      <TextField
        label="Step name"
        value={node.label ?? ''}
        onChange={(e) => onLabel(e.target.value)}
        placeholder={entry?.label}
        fullWidth
        size="small"
        disabled={readOnly}
        slotProps={{ htmlInput: { maxLength: 60 } }}
        sx={{ mb: 2 }}
      />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
        {children}
      </fieldset>
    </Box>
  );
}
