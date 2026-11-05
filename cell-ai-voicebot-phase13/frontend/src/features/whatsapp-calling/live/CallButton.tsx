import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import CallOutlined from '@mui/icons-material/CallOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { useRef, useState } from 'react';

import { useSession } from '@/features/auth/hooks';
import { windowState } from '@/features/inbox/format';
import type { WhatsAppCallProgram } from '@/services/api/types';

import { cannotCallText } from '../labels';
import { RequestPermissionDialog } from '../panel/RequestPermissionDialog';
import { useCallPermission, useCanCall, useCanRequestPermission } from '../queries';

import { CallWithAiDialog } from './CallWithAiDialog';
import { placeCall } from './controller';
import { isLive, useLiveCallStore } from './store';

/**
 * Chat header (and contact panel) call control from the customer's permission:
 * "Request permission" · "Requested · waiting" · "Call" (Call yourself / Call with AI)
 * · "Can't call" with the reason. Hidden for people who can't place calls.
 */
export function CallButton({
  channelId,
  contactId,
  phoneE164,
  label,
  conversationId,
  windowExpiresAt,
  onStarted,
}: {
  channelId: string;
  contactId: string;
  phoneE164: string;
  label: string;
  conversationId: string | null;
  windowExpiresAt: string | null;
  onStarted?: () => void;
}) {
  const canCall = useCanCall();
  const canRequest = useCanRequestPermission();
  const permission = useCallPermission(canCall ? channelId : null, contactId);
  const session = useSession();
  const live = useLiveCallStore((s) => isLive(s.active));
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<'ai' | 'human' | 'request' | null>(null);
  const key = useRef<string | null>(null);
  if (!canCall) return null;
  const p = permission.data;
  const recording = session?.account.settings.recordingEnabled ?? true;
  const call = (mode: 'human' | 'ai', program?: WhatsAppCallProgram) => {
    setMenu(null);
    setDialog(null);
    // one key per click (a double click reuses it)
    key.current = crypto.randomUUID();
    void placeCall({
      channelId,
      contactId,
      mode,
      program: program ?? null,
      label,
      conversationId,
      idempotencyKey: key.current,
      recording,
    });
    onStarted?.();
  };
  const button = (() => {
    if (!p) {
      return (
        <Button size="small" variant="outlined" startIcon={<CallOutlined />} disabled>
          Call
        </Button>
      );
    }
    if (p.canCall) {
      return (
        <Button
          size="small"
          variant="contained"
          startIcon={<CallOutlined />}
          endIcon={<ArrowDropDown />}
          disabled={live}
          aria-haspopup="menu"
          onClick={(e) => setMenu(e.currentTarget)}
        >
          {live ? 'On a call' : 'Call'}
        </Button>
      );
    }
    if (p.status === 'requested') {
      return (
        <Button size="small" variant="outlined" startIcon={<CallOutlined />} disabled>
          Requested · waiting
        </Button>
      );
    }
    if (p.canRequest && canRequest) {
      return (
        <Button
          size="small"
          variant="outlined"
          startIcon={<CallOutlined />}
          onClick={() => setDialog('request')}
        >
          Request permission
        </Button>
      );
    }
    return (
      <Tooltip title={cannotCallText(p.reason)}>
        {/* a span keeps the tooltip on a disabled button */}
        <span>
          <Button size="small" variant="outlined" startIcon={<CallOutlined />} disabled>
            Can&apos;t call
          </Button>
        </span>
      </Tooltip>
    );
  })();
  return (
    <>
      {button}
      {permission.isError && (
        <Alert
          severity="error"
          action={<Button onClick={() => void permission.refetch()}>Retry</Button>}
        >
          Call permission could not be checked. Retry before calling.
        </Alert>
      )}
      <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            setMenu(null);
            setDialog('human');
          }}
        >
          <ListItemText primary="Call yourself" secondary="Talk from this browser" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenu(null);
            setDialog('ai');
          }}
        >
          <ListItemText primary="Call with AI" secondary="A flow or an AI agent talks" />
        </MenuItem>
      </Menu>
      {(dialog === 'ai' || dialog === 'human') && (
        <CallWithAiDialog
          key={`${channelId}:${contactId}`}
          mode={dialog}
          channelId={channelId}
          contactId={contactId}
          contactLabel={label}
          phoneE164={phoneE164}
          onCall={(program) => call(dialog, program)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'request' && (
        <RequestPermissionDialog
          channelId={channelId}
          contactId={contactId}
          windowOpen={windowState(windowExpiresAt).open}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
