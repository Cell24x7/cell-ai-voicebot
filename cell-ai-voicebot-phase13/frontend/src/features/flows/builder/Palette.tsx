import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import type { DragEvent } from 'react';

import type { FlowCatalog, FlowNodeType } from '@/services/api/types';

import { GROUP_LABELS, NODE_ICONS } from './icons';

export const DRAG_TYPE = 'application/x-cell-flow-node';

/** Node palette: drag onto the canvas, or click / Enter to add at the centre. */
export function Palette({
  catalog,
  onAdd,
}: {
  catalog: FlowCatalog;
  onAdd: (type: FlowNodeType) => void;
}) {
  const onDragStart = (e: DragEvent, type: FlowNodeType) => {
    e.dataTransfer.setData(DRAG_TYPE, type);
    e.dataTransfer.effectAllowed = 'move';
  };
  return (
    <List
      dense
      aria-label="Steps"
      sx={{ width: 200, overflowY: 'auto', borderRight: 1, borderColor: 'divider' }}
    >
      {catalog.groups.map((group) => {
        const nodes = catalog.nodes.filter((n) => n.group === group && n.type !== 'start');
        if (!nodes.length) return null;
        return (
          <li key={group}>
            <ul style={{ padding: 0 }}>
              <ListSubheader>{GROUP_LABELS[group] ?? group}</ListSubheader>
              {nodes.map((n) => {
                const Icon = NODE_ICONS[n.type];
                return (
                  <ListItemButton
                    key={n.type}
                    draggable
                    onDragStart={(e) => onDragStart(e, n.type)}
                    onClick={() => onAdd(n.type)}
                    aria-label={`Add ${n.label}`}
                    title={n.description}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Icon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={n.label} />
                  </ListItemButton>
                );
              })}
            </ul>
          </li>
        );
      })}
    </List>
  );
}
