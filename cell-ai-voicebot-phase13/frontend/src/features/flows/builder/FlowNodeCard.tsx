import ErrorOutline from '@mui/icons-material/ErrorOutlined';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

import type {
  DraftNode,
  FlowExitInfo,
  FlowNodeCatalogEntry,
  FlowNodeStat,
} from '@/services/api/types';

import { NODE_ICONS } from './icons';

export interface FlowNodeData extends Record<string, unknown> {
  node: DraftNode;
  entry: FlowNodeCatalogEntry | undefined;
  exits: FlowExitInfo[];
  summary: string;
  errorCount: number;
  warningCount: number;
  stat: FlowNodeStat | undefined;
  highlighted: boolean;
}

export type FlowCanvasNode = Node<FlowNodeData, 'flowNode'>;

/** One step on the canvas: icon, title, summary, a labelled handle per exit. */
function FlowNodeCardBase({ data, selected }: NodeProps<FlowCanvasNode>) {
  const { node, entry, exits, summary, errorCount, warningCount, stat, highlighted } = data;
  const Icon = NODE_ICONS[node.type];
  const title = node.label?.trim() || entry?.label || node.type;
  return (
    <Paper
      variant="outlined"
      data-testid={`flow-node-${node.id}`}
      data-highlighted={highlighted ? 'true' : undefined}
      aria-label={`${title} (${entry?.label ?? node.type})`}
      sx={{
        width: 240,
        borderWidth: selected || highlighted ? 2 : 1,
        borderColor: highlighted
          ? 'secondary.main'
          : selected
            ? 'primary.main'
            : errorCount
              ? 'error.main'
              : 'divider',
        boxShadow: highlighted ? 6 : undefined,
        bgcolor: 'background.paper',
      }}
    >
      {node.type !== 'start' && <Handle type="target" position={Position.Top} id="in" />}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.25, pt: 1 }}>
        <Icon fontSize="small" color="action" />
        <Typography variant="subtitle2" noWrap sx={{ flex: 1 }}>
          {title}
        </Typography>
        {errorCount > 0 && (
          <Tooltip title={`${String(errorCount)} problem${errorCount === 1 ? '' : 's'}`}>
            <Chip
              size="small"
              color="error"
              icon={<ErrorOutline />}
              label={errorCount}
              aria-label={`${String(errorCount)} problems`}
            />
          </Tooltip>
        )}
        {!errorCount && warningCount > 0 && (
          <Chip
            size="small"
            color="warning"
            label={warningCount}
            aria-label={`${String(warningCount)} warnings`}
          />
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" component="p" noWrap sx={{ px: 1.25 }}>
        {summary}
      </Typography>
      {stat && (
        <Typography
          variant="caption"
          color="info.main"
          component="p"
          sx={{ px: 1.25 }}
          data-testid={`flow-stat-${node.id}`}
        >
          {stat.entered} in{stat.errors ? ` · ${String(stat.errors)} errors` : ''}
        </Typography>
      )}
      <Box sx={{ pb: 0.5, pt: exits.length ? 0.5 : 0 }}>
        {exits.map((exit) => (
          <Box
            key={exit.handle}
            sx={{ position: 'relative', textAlign: 'right', pr: 1.5, height: 18 }}
          >
            <Typography
              variant="caption"
              color={
                exit.kind === 'error' ? 'error' : exit.required ? 'text.primary' : 'text.secondary'
              }
            >
              {exit.label}
              {stat?.exits[exit.handle] ? ` (${String(stat.exits[exit.handle])})` : ''}
            </Typography>
            <Handle
              type="source"
              position={Position.Right}
              id={exit.handle}
              aria-label={`${title}: ${exit.label}`}
              style={{ top: 9, background: exit.kind === 'error' ? '#d32f2f' : undefined }}
            />
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

export const FlowNodeCard = memo(FlowNodeCardBase);
