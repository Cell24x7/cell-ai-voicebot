import ListAltOutlined from '@mui/icons-material/ListAltOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import ReplyOutlined from '@mui/icons-material/ReplyOutlined';
import ShoppingCartOutlined from '@mui/icons-material/ShoppingCartOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import { CallPermissionContent } from '@/features/whatsapp-calling/bubbles';
import type { InboxInteractive, InboxMessage } from '@/services/api/types';

import { mapsUrl } from '../format';
import { messageTypeLabel } from '../labels';

import { MessageText } from './MessageText';

const Card = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <Stack
    direction="row"
    spacing={1.5}
    sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover', alignItems: 'flex-start', minWidth: 200 }}
  >
    <Box sx={{ pt: 0.25, color: 'text.secondary', display: 'flex' }}>{icon}</Box>
    <Box sx={{ minWidth: 0, flex: 1 }}>{children}</Box>
  </Stack>
);

/** Name / address as text + a Maps link built from the coordinates only. */
export function LocationCard({ location }: { location: NonNullable<InboxMessage['location']> }) {
  return (
    <Card icon={<PlaceOutlined fontSize="small" />}>
      <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
        {location.name ?? 'Location'}
      </Typography>
      {location.address && (
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {location.address}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" component="div">
        {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
      </Typography>
      <Link
        href={mapsUrl(location.latitude, location.longitude)}
        target="_blank"
        rel="noopener noreferrer"
        variant="body2"
      >
        Open in Google Maps
      </Link>
    </Card>
  );
}

export type SharedContact = NonNullable<InboxMessage['contacts']>[number];

/** Shared contact cards (vCard fields as text) with "Add contact". */
export function ContactsCard({
  contacts,
  onAdd,
}: {
  contacts: SharedContact[];
  /** Missing when the user cannot add contacts. */
  onAdd?: ((card: SharedContact) => void) | undefined;
}) {
  return (
    <Stack spacing={1}>
      {contacts.map((card, i) => (
        <Card key={i} icon={<PersonOutlined fontSize="small" />}>
          <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
            {card.name}
          </Typography>
          {card.org && (
            <Typography variant="caption" color="text.secondary" component="div">
              {card.org}
            </Typography>
          )}
          {card.phones.map((p, j) => (
            <Typography key={j} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              {p.phone}
              {p.type ? ` (${p.type.toLowerCase()})` : ''}
            </Typography>
          ))}
          {card.emails.map((e, j) => (
            <Typography
              key={j}
              variant="body2"
              color="text.secondary"
              sx={{ overflowWrap: 'anywhere' }}
            >
              {e.email}
            </Typography>
          ))}
          {onAdd && card.phones.length > 0 && (
            <Button size="small" sx={{ mt: 0.5, px: 0 }} onClick={() => onAdd(card)}>
              Add contact
            </Button>
          )}
        </Card>
      ))}
    </Stack>
  );
}

/** "Form submitted" answers (`nfm_reply`): the JSON fields as label / value lines. */
const formFields = (json: string | null): [string, string][] => {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    return Object.entries(parsed as Record<string, unknown>)
      .filter(([key]) => key !== 'flow_token')
      .map(([key, value]) => [
        key.replace(/_/g, ' '),
        typeof value === 'string' ? value : JSON.stringify(value),
      ]);
  } catch {
    return [];
  }
};

/** Outgoing buttons / list / link button previews and the customer's replies to them. */
export function InteractiveContent({ interactive: i }: { interactive: InboxInteractive }) {
  // Phase 12: call permission request / reply and the "Call us" button
  if (
    i.kind === 'call_permission_request' ||
    i.kind === 'call_permission_reply' ||
    i.kind === 'voice_call'
  ) {
    return <CallPermissionContent interactive={i} />;
  }
  if (i.kind === 'button_reply' || i.kind === 'list_reply') {
    return (
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <ReplyOutlined fontSize="small" color="action" aria-hidden />
        <Chip
          size="small"
          label={i.reply?.title ?? 'Reply'}
          aria-label={`Replied ${i.reply?.title ?? ''}`.trim()}
        />
        {i.reply?.description && (
          <Typography variant="caption" color="text.secondary">
            {i.reply.description}
          </Typography>
        )}
      </Stack>
    );
  }
  if (i.kind === 'nfm_reply') {
    const fields = formFields(i.nfmResponse);
    return (
      <Card icon={<ListAltOutlined fontSize="small" />}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Form submitted
        </Typography>
        {fields.map(([label, value]) => (
          <Typography key={label} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {label}:
            </Box>{' '}
            {value}
          </Typography>
        ))}
        {i.nfmTruncated && (
          <Typography variant="caption" color="text.secondary">
            Some answers were too long to keep.
          </Typography>
        )}
      </Card>
    );
  }
  return (
    <Stack spacing={0.75}>
      {i.header &&
        (i.header.type === 'text' ? (
          <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
            {i.header.text}
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {messageTypeLabel(i.header.type)} header
            {i.header.fileName ? ` · ${i.header.fileName}` : ''}
          </Typography>
        ))}
      {i.body && <MessageText text={i.body} />}
      {i.footer && (
        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {i.footer}
        </Typography>
      )}
      {(i.buttons.length > 0 || i.listButton || i.cta) && <Divider />}
      {i.buttons.map((b) => (
        <Chip key={b.id} label={b.title} variant="outlined" size="small" />
      ))}
      {i.listButton && (
        <Stack spacing={0.5}>
          <Chip label={i.listButton} variant="outlined" size="small" icon={<ListAltOutlined />} />
          {i.sections.map((section, s) => (
            <Box key={s}>
              {section.title && (
                <Typography variant="caption" color="text.secondary">
                  {section.title}
                </Typography>
              )}
              {section.rows.map((r) => (
                <Typography key={r.id} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  • {r.title}
                  {r.description ? ` — ${r.description}` : ''}
                </Typography>
              ))}
            </Box>
          ))}
        </Stack>
      )}
      {i.cta && (
        <Chip
          variant="outlined"
          size="small"
          icon={<OpenInNewOutlined />}
          label={i.cta.displayText}
          title={i.cta.url}
        />
      )}
    </Stack>
  );
}

/** Customer's order from a catalog. */
export function OrderCard({
  order,
  text,
}: {
  order: NonNullable<InboxMessage['order']>;
  text: string | null;
}) {
  return (
    <Card icon={<ShoppingCartOutlined fontSize="small" />}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        Order · {order.itemsCount} {order.itemsCount === 1 ? 'item' : 'items'}
      </Typography>
      {order.total !== null && (
        <Typography variant="body2">
          {order.currency ?? ''} {order.total.toLocaleString('en-IN')}
        </Typography>
      )}
      {text && <MessageText text={text} />}
    </Card>
  );
}

/** "Clicked an ad" context (Click-to-WhatsApp referral). */
export function ReferralCard({
  referral,
}: {
  referral: NonNullable<NonNullable<InboxMessage['context']>['referral']>;
}) {
  return (
    <Box sx={{ borderLeft: 3, borderColor: 'info.main', pl: 1, mb: 0.5 }}>
      <Typography variant="caption" color="info.main" component="div">
        From an ad{referral.sourceType ? ` (${referral.sourceType})` : ''}
      </Typography>
      {referral.headline && (
        <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
          {referral.headline}
        </Typography>
      )}
      {referral.body && (
        <Typography
          variant="caption"
          color="text.secondary"
          component="div"
          sx={{ overflowWrap: 'anywhere' }}
        >
          {referral.body}
        </Typography>
      )}
      {referral.sourceUrl && <MessageText text={referral.sourceUrl} />}
    </Box>
  );
}

/** The quoted message above a reply; clicking jumps to it. */
export function ReplyQuote({
  replyTo,
  onJump,
}: {
  replyTo: NonNullable<InboxMessage['replyTo']>;
  onJump: (id: string) => void;
}) {
  return (
    <ButtonBase
      onClick={() => onJump(replyTo.id)}
      aria-label={`Go to the quoted message: ${replyTo.preview}`}
      sx={{
        display: 'block',
        textAlign: 'left',
        width: '100%',
        borderLeft: 3,
        borderColor: replyTo.direction === 'out' ? 'success.main' : 'primary.main',
        bgcolor: 'action.hover',
        borderRadius: 0.5,
        px: 1,
        py: 0.5,
        mb: 0.5,
      }}
    >
      <Typography variant="caption" color="text.secondary" component="div">
        {replyTo.direction === 'out' ? 'You' : 'Customer'}
      </Typography>
      <Typography variant="body2" noWrap>
        {replyTo.preview}
      </Typography>
    </ButtonBase>
  );
}
