import ArrowBack from '@mui/icons-material/ArrowBack';
import PhoneInTalkOutlined from '@mui/icons-material/PhoneInTalkOutlined';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { useCan, useSession } from '@/features/auth/hooks';
import { useCanTriggerCalls } from '@/features/calls/queries';
import { ContactFormDialog } from '@/features/contacts/ContactFormDialog';
import { ContactStatusChips } from '@/features/contacts/ContactsTab';
import { contactKeys, dndKeys } from '@/features/contacts/keys';
import { useContactTags, useCustomFields, useListOptions } from '@/features/contacts/queries';
import { contactsApi, type ContactInput } from '@/services/api/contacts';
import { dndApi } from '@/services/api/dnd';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { Contact } from '@/services/api/types';
import { formatInAccountTz } from '@/utils/datetime';
import { formatFieldValue } from '@/utils/format';
import { formatPhone } from '@/utils/phone';

// calling widgets pull campaign code (labels, time zones) → their own chunks
// the inbox hooks stay out of the main bundle
const ContactChatButton = lazy(async () => ({
  default: (await import('@/features/inbox/ContactChatButton')).ContactChatButton,
}));
const ContactTemplateButton = lazy(async () => ({
  default: (await import('@/features/templates/send/ContactTemplateButton')).ContactTemplateButton,
}));
const CallNowDialog = lazy(async () => ({
  default: (await import('@/features/calls/CallNowDialog')).CallNowDialog,
}));
const ContactCallsCard = lazy(async () => ({
  default: (await import('@/features/calls/ContactCallsCard')).ContactCallsCard,
}));

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" component="div">
        {children}
      </Typography>
    </Box>
  );
}

const back = (
  <Button component={RouterLink} to="/contacts/all" startIcon={<ArrowBack />} sx={{ mb: 2 }}>
    All contacts
  </Button>
);

/** `/contacts/c/:id` — one contact: details, variables, lists, tags, consent. */
export function ContactDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const timezone = useSession()?.account.timezone ?? 'Asia/Kolkata';
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [calling, setCalling] = useState(false);
  const canCall = useCanTriggerCalls();
  const fields = useCustomFields();
  const lists = useListOptions();
  const tags = useContactTags();
  const contact = useQuery({
    queryKey: contactKeys.detail(id),
    queryFn: () => contactsApi.get(id),
    meta: { silent: true },
  });

  const afterChange = (updated: Contact, message: string) => {
    queryClient.setQueryData(contactKeys.detail(id), updated);
    void queryClient.invalidateQueries({ queryKey: contactKeys.all });
    void queryClient.invalidateQueries({ queryKey: dndKeys.all });
    enqueueSnackbar(message, { variant: 'success' });
  };
  const fail = (err: unknown) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' });

  /** Tags / lists edited inline — optimistic, rolled back on error. */
  const patch = useMutation({
    mutationFn: (body: ContactInput) => contactsApi.update(id, body),
    meta: { silent: true },
    onMutate: (body) => {
      const previous = queryClient.getQueryData<Contact>(contactKeys.detail(id));
      if (previous) queryClient.setQueryData(contactKeys.detail(id), { ...previous, ...body });
      return { previous };
    },
    onError: (err, _body, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(contactKeys.detail(id), ctx.previous);
      fail(err);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(contactKeys.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
  const optOut = useMutation({
    mutationFn: () => contactsApi.optOut(id),
    meta: { silent: true },
    onSuccess: (c) => afterChange(c, 'Opted out — the number is on the do-not-call list'),
    onError: fail,
  });
  const undoOptOut = useMutation({
    mutationFn: () => contactsApi.undoOptOut(id),
    meta: { silent: true },
    onSuccess: (c) => afterChange(c, 'Opt-out removed'),
    onError: fail,
  });
  const addDnd = useMutation({
    mutationFn: (phone: string) => dndApi.add({ phone }),
    meta: { silent: true },
    onSuccess: async () => {
      afterChange(await contactsApi.get(id), 'Added to the do-not-call list');
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => contactsApi.remove(id),
    meta: { silent: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
      enqueueSnackbar('Contact deleted', { variant: 'success' });
      void navigate('/contacts/all');
    },
    onError: fail,
  });

  if (contact.isPending) {
    return (
      <>
        {back}
        <Skeleton variant="text" width={260} height={40} />
        <Skeleton variant="rounded" height={180} />
      </>
    );
  }
  if (contact.error) {
    return (
      <>
        {back}
        {toApiError(contact.error).status === 404 ? (
          <EmptyState
            title="Contact not found"
            description="It may have been deleted, or it belongs to another account."
          />
        ) : (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void contact.refetch()}>
                Retry
              </Button>
            }
          >
            {getErrorMessage(contact.error)}
          </Alert>
        )}
      </>
    );
  }

  const c = contact.data;
  const phone = formatPhone(c.phoneE164);
  const writable = can('contacts.write');
  const act = async (kind: 'optOut' | 'undo' | 'dnd' | 'delete') => {
    setMenu(null);
    if (kind === 'optOut') {
      const ok = await confirm({
        title: 'Opt this contact out?',
        message:
          'They will not be called again, and the number goes on the do-not-call list. Only an owner or admin can undo this.',
        confirmText: 'Opt out',
      });
      if (ok) optOut.mutate();
    } else if (kind === 'undo') {
      const ok = await confirm({
        title: 'Undo the opt-out?',
        message:
          'The number comes off the do-not-call list and can be called again. Make sure the customer agreed.',
        confirmText: 'Undo opt-out',
        destructive: true,
      });
      if (ok) undoOptOut.mutate();
    } else if (kind === 'dnd') {
      addDnd.mutate(c.phoneE164);
    } else if (
      await confirm({
        title: `Delete ${c.name ?? phone}?`,
        message: 'You can restore it by adding the same number again within 30 days.',
        confirmText: 'Delete',
        destructive: true,
      })
    ) {
      remove.mutate();
    }
  };

  return (
    <>
      {back}
      <PageHeader
        title={c.name ?? phone}
        subtitle={
          <Stack direction="row" spacing={1} component="span" sx={{ alignItems: 'center' }}>
            <span>{phone}</span>
            <ContactStatusChips contact={c} />
          </Stack>
        }
        actions={
          <>
            <Suspense fallback={null}>
              <ContactChatButton contactId={c.id} phoneE164={c.phoneE164} />
            </Suspense>
            <Suspense fallback={null}>
              <ContactTemplateButton contact={c} />
            </Suspense>
            {(writable || can('dnd.manage') || canCall) && (
              <>
                {canCall && (
                  <>
                    <Button
                      variant="contained"
                      startIcon={<PhoneInTalkOutlined />}
                      // the server's dial guard refuses DND / opted-out contacts with the reason
                      onClick={() => setCalling(true)}
                    >
                      Call now
                    </Button>
                    <Button component={RouterLink} to={`/calls/test?contactId=${c.id}`}>
                      Test in browser
                    </Button>
                  </>
                )}
                {writable && (
                  <Button variant="outlined" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                )}
                {(writable || can('dnd.manage')) && (
                  <Button onClick={(e) => setMenu(e.currentTarget)}>More</Button>
                )}
                <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
                  {writable && !c.optedOutAt && (
                    <MenuItem onClick={() => void act('optOut')}>Opt out</MenuItem>
                  )}
                  {can('dnd.manage') && c.optedOutAt && (
                    <MenuItem onClick={() => void act('undo')}>Undo opt-out</MenuItem>
                  )}
                  {writable && !c.dnd && (
                    <MenuItem onClick={() => void act('dnd')}>Add to do-not-call</MenuItem>
                  )}
                  {writable && (
                    <MenuItem onClick={() => void act('delete')} sx={{ color: 'error.main' }}>
                      Delete
                    </MenuItem>
                  )}
                </Menu>
              </>
            )}
          </>
        }
      />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" component="h2" sx={{ mb: 1.5 }}>
                Details
              </Typography>
              <Stack spacing={1.5}>
                <Fact label="Phone">{phone}</Fact>
                <Fact label="E-mail">{c.email ?? '—'}</Fact>
                <Fact label="External id">{c.externalId ?? '—'}</Fact>
                <Fact label="Source">
                  {c.source.type === 'import' && c.source.importJobId ? (
                    <Link component={RouterLink} to={`/contacts/import/${c.source.importJobId}`}>
                      Imported from a file
                    </Link>
                  ) : c.source.type === 'api' ? (
                    'API'
                  ) : (
                    'Added by hand'
                  )}
                </Fact>
                <Fact label="Added">{formatInAccountTz(c.createdAt, timezone)}</Fact>
                <Fact label="Last changed">{formatInAccountTz(c.updatedAt, timezone)}</Fact>
                {c.optedOutAt && (
                  <Fact label="Opted out">{formatInAccountTz(c.optedOutAt, timezone)}</Fact>
                )}
                {c.whatsapp && (
                  <Fact label="WhatsApp">
                    {[
                      c.whatsapp.profileName ? `~${c.whatsapp.profileName}` : null,
                      c.whatsapp.lastInboundAt
                        ? `last message ${formatInAccountTz(c.whatsapp.lastInboundAt, timezone)}`
                        : null,
                      c.whatsapp.blocked ? 'blocked' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'On WhatsApp'}
                  </Fact>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" component="h2" sx={{ mb: 1.5 }}>
                Variables
              </Typography>
              {(fields.data ?? []).length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No custom fields yet — add them in the Fields tab or while importing.
                </Typography>
              ) : (
                <Stack spacing={1.5}>
                  {(fields.data ?? []).map((f) => (
                    <Fact key={f.key} label={f.label}>
                      {formatFieldValue(f.type, c.variables[f.key], formatPhone)}
                    </Fact>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" component="h2" sx={{ mb: 1.5 }}>
                Lists & tags
              </Typography>
              <Stack spacing={2}>
                <Autocomplete
                  multiple
                  disabled={!writable}
                  options={(lists.data ?? []).map((l) => l.id)}
                  getOptionLabel={(lid) =>
                    lists.data?.find((l) => l.id === lid)?.name ??
                    c.lists?.find((l) => l.id === lid)?.name ??
                    lid
                  }
                  value={c.listIds}
                  onChange={(_e, value) => patch.mutate({ listIds: value })}
                  renderInput={(params) => <TextField {...params} label="Lists" />}
                />
                <Autocomplete
                  multiple
                  freeSolo
                  disabled={!writable}
                  options={(tags.data ?? []).map((t) => t.tag)}
                  value={c.tags}
                  onChange={(_e, value) =>
                    patch.mutate({ tags: value.map((t) => t.trim().toLowerCase()).filter(Boolean) })
                  }
                  renderValue={(value, getItemProps) =>
                    value.map((option, index) => {
                      const { key, ...itemProps } = getItemProps({ index });
                      return <Chip key={key} size="small" label={option} {...itemProps} />;
                    })
                  }
                  renderInput={(params) => <TextField {...params} label="Tags" />}
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={2}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" component="h2" sx={{ mb: 1.5 }}>
                  Consent
                </Typography>
                {c.consent ? (
                  <Typography variant="body2">
                    {c.consent.source} · {formatInAccountTz(c.consent.at, timezone)}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Not recorded
                  </Typography>
                )}
              </CardContent>
            </Card>
            {can('calls.read') && (
              <Suspense fallback={<Skeleton variant="rounded" height={120} />}>
                <ContactCallsCard contact={c} />
              </Suspense>
            )}
          </Stack>
        </Grid>
      </Grid>
      {calling && (
        <Suspense fallback={null}>
          <CallNowDialog contactId={c.id} timezone={timezone} onClose={() => setCalling(false)} />
        </Suspense>
      )}
      {editing && (
        <ContactFormDialog
          open
          onClose={() => setEditing(false)}
          fields={fields.data ?? []}
          contact={c}
        />
      )}
    </>
  );
}
