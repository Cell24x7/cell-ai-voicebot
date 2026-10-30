import ArrowDownward from '@mui/icons-material/ArrowDownward';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { DataTable, type Column } from '@/components/DataTable';
import { useCan } from '@/features/auth/hooks';
import { TYPE_LABEL } from '@/features/contact-imports/import-text';
import { customFieldsApi } from '@/services/api/custom-fields';
import { getErrorMessage } from '@/services/api/errors';
import type { CustomField } from '@/services/api/types';
import { formatFieldValue, formatNumber } from '@/utils/format';
import { formatPhone } from '@/utils/phone';

import { FieldDialog } from './FieldDialog';
import { contactKeys, fieldKeys, segmentKeys } from './keys';
import { useCustomFields } from './queries';

const MAX_FIELDS = 50;

/** `/contacts/fields` — the account's custom fields (variables for scripts). */
export function FieldsTab() {
  const can = useCan();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const fields = useCustomFields(true);
  const [editing, setEditing] = useState<CustomField | 'new' | null>(null);
  const write = can('contacts.write');
  const rows = fields.data ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: fieldKeys.all });
  };
  const reorder = useMutation({
    mutationFn: (ids: string[]) => customFieldsApi.reorder(ids),
    meta: { silent: true },
    onMutate: (ids) => {
      // optimistic: show the new order right away
      const key = fieldKeys.list(true);
      const before = queryClient.getQueryData<CustomField[]>(key);
      if (before) {
        queryClient.setQueryData(
          key,
          ids.map((id) => before.find((f) => f.id === id)).filter(Boolean),
        );
      }
      return { before };
    },
    onError: (err, _ids, context) => {
      if (context?.before) queryClient.setQueryData(fieldKeys.list(true), context.before);
      enqueueSnackbar(getErrorMessage(err), { variant: 'error' });
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => customFieldsApi.remove(id),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Field deleted', { variant: 'success' });
      refresh();
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
      void queryClient.invalidateQueries({ queryKey: segmentKeys.all });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });

  const move = (index: number, by: -1 | 1) => {
    const ids = rows.map((f) => f.id);
    const target = index + by;
    const a = ids[index];
    const b = ids[target];
    if (a === undefined || b === undefined) return;
    ids[index] = b;
    ids[target] = a;
    reorder.mutate(ids);
  };

  const columns: Column<CustomField>[] = [
    ...(write
      ? [
          {
            key: 'order',
            header: 'Order',
            width: 96,
            render: (f: CustomField) => {
              const i = rows.indexOf(f);
              return (
                <>
                  <IconButton
                    size="small"
                    aria-label={`Move ${f.label} up`}
                    disabled={i === 0 || reorder.isPending}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUpward fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label={`Move ${f.label} down`}
                    disabled={i === rows.length - 1 || reorder.isPending}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDownward fontSize="small" />
                  </IconButton>
                </>
              );
            },
          },
        ]
      : []),
    { key: 'label', header: 'Label', render: (f) => f.label },
    {
      key: 'key',
      header: 'Key',
      render: (f) => (
        <Typography component="code" variant="body2" sx={{ fontFamily: 'monospace' }}>
          {f.key}
        </Typography>
      ),
    },
    { key: 'type', header: 'Type', render: (f) => TYPE_LABEL[f.type] },
    { key: 'required', header: 'Required', render: (f) => (f.required ? 'Yes' : 'No') },
    {
      key: 'default',
      header: 'Default',
      render: (f) =>
        f.defaultValue === null ? '—' : formatFieldValue(f.type, f.defaultValue, formatPhone),
    },
    {
      key: 'usage',
      header: 'Contacts with a value',
      align: 'right',
      render: (f) => (f.usageCount === undefined ? '—' : formatNumber(f.usageCount)),
    },
    ...(write
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (f: CustomField) => (
              <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => setEditing(f)}>
                  Edit
                </Button>
                <Button
                  size="small"
                  color="error"
                  onClick={() =>
                    void confirm({
                      title: `Delete field "${f.label}"?`,
                      message: f.usageCount
                        ? `${formatNumber(f.usageCount)} contacts have a value — it will be removed from all of them. Segments using it stop matching until edited.`
                        : 'No contact has a value for it yet.',
                      confirmText: 'Delete field',
                      destructive: true,
                    }).then((ok) => ok && remove.mutate(f.id))
                  }
                >
                  Delete
                </Button>
              </Stack>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ mb: 2, alignItems: { sm: 'center' } }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          Extra details per contact (loan amount, due date…). Scripts use them as {'{{key}}'}.{' '}
          {rows.length} of {MAX_FIELDS} fields.
        </Typography>
        {write && (
          <Button
            variant="outlined"
            disabled={rows.length >= MAX_FIELDS}
            onClick={() => setEditing('new')}
          >
            New field
          </Button>
        )}
      </Stack>
      <DataTable
        aria-label="Fields"
        columns={columns}
        rows={fields.data}
        getRowId={(f) => f.id}
        loading={fields.isPending}
        error={fields.error}
        onRetry={() => void fields.refetch()}
        emptyTitle="No custom fields yet"
        emptyDescription="Add one here, or create them while importing a sheet."
      />
      {editing && (
        <FieldDialog
          field={editing === 'new' ? undefined : editing}
          fields={rows}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
