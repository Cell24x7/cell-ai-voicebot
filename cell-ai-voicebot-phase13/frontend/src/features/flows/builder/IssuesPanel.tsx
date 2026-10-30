import ErrorOutline from '@mui/icons-material/ErrorOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import type { FlowIssue } from '@/services/api/types';

/** Problems of the flow (errors first); click one to jump to its step. */
export function IssuesPanel({
  issues,
  onFocus,
}: {
  issues: FlowIssue[];
  onFocus: (nodeId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const ordered = [...errors, ...warnings];
  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider', maxHeight: 220, overflowY: 'auto' }}>
      <Button size="small" onClick={() => setOpen((o) => !o)} aria-expanded={open} sx={{ m: 0.5 }}>
        {errors.length} error{errors.length === 1 ? '' : 's'} · {warnings.length} warning
        {warnings.length === 1 ? '' : 's'}
      </Button>
      <Collapse in={open}>
        {ordered.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1 }}>
            No problems found.
          </Typography>
        ) : (
          <List dense aria-label="Problems">
            {ordered.map((issue, i) => (
              <ListItemButton
                key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? ''}-${String(i)}`}
                disabled={!issue.nodeId}
                onClick={() => issue.nodeId && onFocus(issue.nodeId)}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {issue.severity === 'error' ? (
                    <ErrorOutline fontSize="small" color="error" />
                  ) : (
                    <WarningAmberOutlined fontSize="small" color="warning" />
                  )}
                </ListItemIcon>
                <ListItemText primary={issue.message} />
              </ListItemButton>
            ))}
          </List>
        )}
      </Collapse>
    </Box>
  );
}
