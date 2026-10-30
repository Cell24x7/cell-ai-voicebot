import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';

import { DataTable, type Column } from '@/components/DataTable';
import { RelativeTime } from '@/components/RelativeTime';
import { useCan, useSession } from '@/features/auth/hooks';
import { ExportDialog } from '@/features/contact-exports/ExportDialog';
import { useCanExport } from '@/features/contact-exports/useExportJob';
import { AdvancedFilterDialog } from '@/features/segments/AdvancedFilterDialog';
import { describeFilter, filterSize } from '@/features/segments/segment-filter';
import { SegmentDialog } from '@/features/segments/SegmentDialog';
import { contactsApi } from '@/services/api/contacts';
import type { Contact } from '@/services/api/types';
import { formatFieldValue } from '@/utils/format';
import { formatPhone } from '@/utils/phone';

import { BulkActionsBar } from './BulkActionsBar';
import { readColumns, saveColumns } from './column-storage';
import { ColumnPicker } from './ColumnPicker';
import { ContactFormDialog } from './ContactFormDialog';
import {
  hasFilters,
  readView,
  toFilter,
  toQuery,
  writeView,
  type ContactsView,
} from './contacts-view';
import { contactKeys } from './keys';
import { useContactTags, useCustomFields, useListOptions, useSegments } from './queries';

export function ContactStatusChips({ contact }: { contact: Pick<Contact, 'dnd' | 'optedOutAt'> }) {
  return (
    <>
      {contact.optedOutAt && (
        <Chip size="small" color="warning" variant="outlined" label="Opted out" sx={{ mr: 0.5 }} />
      )}
      {contact.dnd && <Chip size="small" color="error" variant="outlined" label="Do not call" />}
    </>
  );
}

const MAX_TAG_CHIPS = 3;

/** `/contacts/all` — searchable, filterable contacts table with bulk actions. */
export function ContactsTab() {
  const can = useCan();
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const view = readView(params);
  const [search, setSearch] = useState(view.q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [dialog, setDialog] = useState<'advanced' | 'save-segment' | 'export' | null>(null);
  const canExport = useCanExport();
  const userId = session?.user.id ?? 'anon';
  const [visible, setVisible] = useState<string[]>(() => readColumns(userId));

  const fields = useCustomFields();
  const lists = useListOptions();
  const segments = useSegments();
  const tags = useContactTags();
  const query = toQuery(view);
  const advanced = view.advanced;
  const contacts = useQuery({
    queryKey: advanced
      ? contactKeys.search({
          filter: advanced,
          page: view.page,
          limit: view.limit,
          sort: query.sort,
        })
      : contactKeys.list(query),
    queryFn: () =>
      advanced
        ? contactsApi.search({
            filter: advanced,
            page: view.page,
            limit: view.limit,
            sort: query.sort,
          })
        : contactsApi.list(query),
    placeholderData: keepPreviousData,
    meta: { silent: true },
  });

  const update = (patch: Partial<ContactsView>, keepPage = false) => {
    setParams(writeView({ ...view, ...patch, ...(keepPage ? {} : { page: 1 }) }));
    if (!keepPage || patch.limit) {
      setSelected(new Set());
      setAllMatching(false);
    }
  };

  // debounce the search box into the URL
  useEffect(() => {
    if (search.trim() === view.q) return undefined;
    const t = setTimeout(() => update({ q: search.trim() }), 300);
    return () => clearTimeout(t);
  });

  const segment = segments.data?.find((s) => s.id === view.segmentId);
  const filter = toFilter(view, segment);
  const shownFields = (fields.data ?? []).filter((f) => visible.includes(f.key));

  const columns = useMemo<Column<Contact>[]>(
    () => [
      {
        key: 'name',
        header: 'Name',
        sortField: 'name',
        render: (c) => (
          <Link component={RouterLink} to={`/contacts/c/${c.id}`}>
            {c.name ?? formatPhone(c.phoneE164)}
          </Link>
        ),
      },
      { key: 'phone', header: 'Phone', render: (c) => formatPhone(c.phoneE164) },
      {
        key: 'tags',
        header: 'Tags',
        render: (c) => (
          <>
            {c.tags.slice(0, MAX_TAG_CHIPS).map((t) => (
              <Chip key={t} size="small" label={t} sx={{ mr: 0.5 }} />
            ))}
            {c.tags.length > MAX_TAG_CHIPS && (
              <Chip size="small" variant="outlined" label={`+${c.tags.length - MAX_TAG_CHIPS}`} />
            )}
          </>
        ),
      },
      { key: 'status', header: 'Status', render: (c) => <ContactStatusChips contact={c} /> },
      ...shownFields.map<Column<Contact>>((f) => ({
        key: `field:${f.key}`,
        header: f.label,
        align: f.type === 'currency' || f.type === 'number' ? 'right' : undefined,
        render: (c) => formatFieldValue(f.type, c.variables[f.key], formatPhone),
      })),
      {
        key: 'created',
        header: 'Added',
        sortField: 'createdAt',
        render: (c) => <RelativeTime value={c.createdAt} />,
      },
    ],
    [shownFields],
  );

  const total = contacts.data?.meta.total ?? 0;
  const filtered = hasFilters(view);

  return (
    <>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ mb: 2, flexWrap: 'wrap' }}
        useFlexGap
      >
        {advanced ? (
          <Alert
            severity="info"
            sx={{ flexGrow: 1, py: 0 }}
            action={
              <>
                <Button size="small" onClick={() => setDialog('advanced')}>
                  Edit
                </Button>
                {can('contacts.write') && (
                  <Button size="small" onClick={() => setDialog('save-segment')}>
                    Save as segment
                  </Button>
                )}
              </>
            }
          >
            Advanced filter: {describeFilter(advanced, fields.data ?? [])}
          </Alert>
        ) : (
          <>
            <TextField
              size="small"
              label="Search name, phone, e-mail, id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: 240 }}
            />
            <TextField
              size="small"
              select
              label="List"
              value={view.listId}
              onChange={(e) => update({ listId: e.target.value })}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">All lists</MenuItem>
              {(lists.data ?? []).map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.name}
                </MenuItem>
              ))}
            </TextField>
            <Autocomplete
              multiple
              size="small"
              options={(tags.data ?? []).map((t) => t.tag)}
              value={view.tags}
              onChange={(_e, v) => update({ tags: v })}
              renderInput={(p) => <TextField {...p} label="Tags (any)" />}
              sx={{ minWidth: 200 }}
            />
            <TextField
              size="small"
              select
              label="Do-not-call"
              value={view.dnd}
              onChange={(e) => update({ dnd: e.target.value as ContactsView['dnd'] })}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">On the list</MenuItem>
              <MenuItem value="false">Not on the list</MenuItem>
            </TextField>
            <TextField
              size="small"
              select
              label="Opted out"
              value={view.optedOut}
              onChange={(e) => update({ optedOut: e.target.value as ContactsView['optedOut'] })}
              sx={{ minWidth: 130 }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Opted out</MenuItem>
              <MenuItem value="false">Not opted out</MenuItem>
            </TextField>
            <TextField
              size="small"
              select
              label="Segment"
              value={view.segmentId}
              onChange={(e) => update({ segmentId: e.target.value })}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">None</MenuItem>
              {(segments.data ?? []).map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>
          </>
        )}
        <Button onClick={() => setDialog('advanced')}>
          {advanced ? `Advanced filter (${filterSize(advanced)})` : 'Advanced filter'}
        </Button>
        {filtered && (
          <Button
            onClick={() => {
              setSearch('');
              setParams(new URLSearchParams());
              setSelected(new Set());
              setAllMatching(false);
            }}
          >
            Clear filters
          </Button>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <ColumnPicker
          fields={fields.data ?? []}
          value={visible}
          onChange={(keys) => {
            setVisible(keys);
            saveColumns(userId, keys);
          }}
        />
        {canExport && (
          <Button variant="outlined" onClick={() => setDialog('export')}>
            Export
          </Button>
        )}
        {can('contacts.write') && (
          <Button variant="outlined" onClick={() => setFormOpen(true)}>
            Add contact
          </Button>
        )}
      </Stack>

      {can('contacts.write') && (selected.size > 0 || allMatching) && (
        <BulkActionsBar
          selectedIds={[...selected]}
          allMatching={allMatching}
          total={total}
          filter={filter}
          onSelectAllMatching={() => setAllMatching(true)}
          onClear={() => {
            setSelected(new Set());
            setAllMatching(false);
          }}
          extraActions={
            canExport ? <Button onClick={() => setDialog('export')}>Export</Button> : undefined
          }
        />
      )}

      <DataTable
        aria-label="Contacts"
        columns={columns}
        rows={contacts.data?.data}
        getRowId={(c) => c.id}
        getRowLabel={(c) => c.name ?? formatPhone(c.phoneE164)}
        loading={contacts.isPending}
        error={contacts.error}
        onRetry={() => void contacts.refetch()}
        emptyTitle={filtered ? 'No contacts match' : 'No contacts yet'}
        emptyDescription={
          filtered ? 'Try other filters.' : 'Import a sheet or add a contact to get started.'
        }
        selection={
          can('contacts.write')
            ? {
                selected,
                onChange: (next) => {
                  setSelected(next);
                  setAllMatching(false);
                },
              }
            : undefined
        }
        sort={view.sort}
        onSortChange={(sort) => update({ sort })}
        pagination={
          contacts.data
            ? {
                page: view.page,
                limit: view.limit,
                total,
                onPageChange: (page) => update({ page }, true),
                onLimitChange: (limit) => update({ limit }),
              }
            : undefined
        }
      />
      {formOpen && (
        <ContactFormDialog open onClose={() => setFormOpen(false)} fields={fields.data ?? []} />
      )}
      {dialog === 'advanced' && (
        <AdvancedFilterDialog
          initial={advanced ?? filter ?? {}}
          fields={fields.data ?? []}
          onClose={() => setDialog(null)}
          onApply={(next) => {
            setDialog(null);
            setSearch('');
            update({
              advanced: next,
              q: '',
              listId: '',
              tags: [],
              dnd: '',
              optedOut: '',
              segmentId: '',
            });
          }}
        />
      )}
      {dialog === 'save-segment' && advanced && (
        <SegmentDialog
          open
          onClose={() => setDialog(null)}
          fields={fields.data ?? []}
          initialFilter={advanced}
          onSaved={(saved) => update({ advanced: null, segmentId: saved.id })}
        />
      )}
      {dialog === 'export' && (
        <ExportDialog
          open
          onClose={() => setDialog(null)}
          ids={allMatching ? undefined : [...selected]}
          filter={filter}
          filterCount={total}
        />
      )}
    </>
  );
}
