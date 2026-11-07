import type { SipTrunkInput } from '@/services/api/sip-trunks';

/** Admin → account → SIP trunk: the form's checks. */

const HOST = /^[a-zA-Z0-9.-]{1,253}$/;
const E164 = /^\+[1-9]\d{7,14}$/;
const IP = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

/** Field problems of the trunk form (empty = can be saved). */
export const trunkProblems = (
  d: SipTrunkInput & { ipsText: string },
  passwordSaved: boolean,
): Record<string, string> => {
  const p: Record<string, string> = {};
  if (!HOST.test(d.host.trim())) p.host = 'A host name or IP, e.g. sip.carrier.in';
  if (!Number.isInteger(d.port) || d.port < 1 || d.port > 65535) p.port = '1 to 65535';
  if (!E164.test(d.callerId.trim())) p.callerId = 'With country code, e.g. +911600000000';
  if (d.auth === 'register') {
    if (!d.username?.trim()) p.username = 'Enter the username the carrier gave';
    if (!d.password && !passwordSaved) p.password = 'Enter the password the carrier gave';
  }
  const ips = d.ipsText.split(/[\s,]+/).filter(Boolean);
  if (ips.some((ip) => !IP.test(ip))) p.ipsText = 'IP addresses or ranges, comma separated';
  return p;
};
