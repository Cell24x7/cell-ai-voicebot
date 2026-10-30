import { lazy, Suspense, useEffect } from 'react';

import { useWsEvent } from '@/services/realtime';

import { useCallingLiveUpdates, useCanAnswer } from '../queries';

import { clearCall, hangupCall, onCallEnded, onCallStatus } from './controller';
import { useLiveCallStatus } from './queries';
import { isLive, useLiveCallStore } from './store';

const CallBar = lazy(() => import('./CallBar'));
const IncomingPopup = lazy(() => import('./IncomingPopup'));

/**
 * Always mounted in the app shell, tiny: forwards WhatsApp call events to the live
 * call and loads the call bar / incoming popup only while there is something to show.
 */
export function CallMounts() {
  useCallingLiveUpdates();
  useLiveCallStatus();
  useEffect(
    () => () => {
      if (isLive(useLiveCallStore.getState().active)) void hangupCall();
      clearCall();
      useLiveCallStore.setState({ incoming: [] });
    },
    [],
  );
  const active = useLiveCallStore((s) => s.active);
  const ringing = useLiveCallStore((s) => s.incoming.length > 0);
  const canAnswer = useCanAnswer();
  const { ring, taken, stopRinging } = useLiveCallStore.getState();
  useWsEvent('call.status', (e) => {
    if (e.data.provider === 'whatsapp') onCallStatus(e.data.callId, e.data.status);
  });
  useWsEvent('call.ended', (e) => {
    if (e.data.provider === 'whatsapp')
      onCallEnded(e.data.callId, { endReason: e.data.endReason, durationSec: e.data.durationSec });
  });
  useWsEvent('whatsapp.call.incoming', (e) => {
    if (canAnswer) ring(e.data);
  });
  useWsEvent('whatsapp.call.taken', (e) => taken(e.data.callId, e.data.byUserId));
  useWsEvent('whatsapp.call.ended_ringing', (e) => stopRinging(e.data.callId));
  return (
    <Suspense fallback={null}>
      {active && <CallBar />}
      {ringing && canAnswer && <IncomingPopup />}
    </Suspense>
  );
}
