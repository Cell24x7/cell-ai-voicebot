import PhoneInTalkOutlined from '@mui/icons-material/PhoneInTalkOutlined';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';

import { useCanTriggerCalls } from './queries';

/**
 * "Test call" from a flow (saved draft or published version) or an agent —
 * opens the web call tester prefilled. Hidden without calls.trigger.
 */
export function TestCallButton(
  props:
    | { kind: 'flow'; flowId: string; publishedVersion: number | null; dirty: boolean }
    | { kind: 'agent'; agentId: string; active: boolean; dirty: boolean },
) {
  const canTrigger = useCanTriggerCalls();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!canTrigger) return null;
  const blocked = props.dirty
    ? 'Save first — test calls use the saved version.'
    : props.kind === 'agent' && !props.active
      ? 'Switch the agent on first.'
      : null;
  const button = (onClick?: (e: React.MouseEvent<HTMLElement>) => void) => (
    <Tooltip title={blocked ?? ''}>
      <span>
        <Button
          startIcon={<PhoneInTalkOutlined />}
          disabled={Boolean(blocked)}
          {...(props.kind === 'agent'
            ? { component: RouterLink, to: `/calls/test?agentId=${props.agentId}` }
            : { onClick })}
        >
          Test call
        </Button>
      </span>
    </Tooltip>
  );
  if (props.kind === 'agent') return button();
  const go = (version: 'draft' | 'published') =>
    void navigate(`/calls/test?flowId=${props.flowId}&version=${version}`);
  return (
    <>
      {button((e) => (props.publishedVersion === null ? go('draft') : setAnchor(e.currentTarget)))}
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => go('published')}>
          Published (v{props.publishedVersion ?? ''})
        </MenuItem>
        <MenuItem onClick={() => go('draft')}>Saved draft</MenuItem>
      </Menu>
    </>
  );
}
