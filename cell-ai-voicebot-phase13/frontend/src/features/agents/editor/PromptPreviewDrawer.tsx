import CloseOutlined from '@mui/icons-material/CloseOutlined';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { CopyButton } from '@/components/CopyButton';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { agentsApi } from '@/services/api/agents';
import { contactsApi } from '@/services/api/contacts';
import { getErrorMessage } from '@/services/api/errors';
import type { Agent, Contact } from '@/services/api/types';

import { warningText } from './editor-context';

/**
 * "What will the AI be told?" — compiles the saved agent with a sample
 * contact or typed values. No cost.
 */
export function PromptPreviewDrawer({
  agent,
  open,
  onClose,
  dirty,
}: {
  agent: Agent;
  open: boolean;
  onClose: () => void;
  dirty: boolean;
}) {
  const [source, setSource] = useState<'contact' | 'manual'>('manual');
  const [contact, setContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [values, setValues] = useState<Record<string, string>>({});
  const [channel, setChannel] = useState<'text' | 'voice'>('text');

  const contacts = useQuery({
    queryKey: ['contacts', 'picker', q],
    queryFn: () => contactsApi.list({ q: q || undefined, limit: 10 }),
    enabled: open && source === 'contact',
  });
  const preview = useMutation({
    mutationFn: () =>
      agentsApi.compilePreview(agent.id, {
        channel,
        ...(source === 'contact' && contact ? { contactId: contact.id } : { variables: values }),
      }),
  });

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 560 } } } }}
    >
      <Box sx={{ p: 2 }} role="region" aria-label="Prompt preview">
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
        >
          <Typography variant="h6" component="h2">
            Prompt preview
          </Typography>
          <IconButton aria-label="Close preview" onClick={onClose}>
            <CloseOutlined />
          </IconButton>
        </Stack>
        {dirty && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Shows the saved version — save your changes to preview them.
          </Alert>
        )}
        <Stack spacing={2}>
          <RadioGroup
            row
            value={source}
            onChange={(e) => setSource(e.target.value as 'contact' | 'manual')}
            aria-label="Values from"
          >
            <FormControlLabel value="manual" control={<Radio />} label="Type values" />
            <FormControlLabel value="contact" control={<Radio />} label="Sample contact" />
          </RadioGroup>
          {source === 'contact' ? (
            <Autocomplete
              options={contacts.data?.data ?? []}
              value={contact}
              onChange={(_e, v) => setContact(v)}
              onInputChange={(_e, v) => setSearch(v)}
              filterOptions={(x) => x}
              loading={contacts.isFetching}
              getOptionLabel={(c) => `${c.name ?? 'No name'} · ••••${c.phoneE164.slice(-4)}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField {...params} label="Contact" placeholder="Search by name or phone" />
              )}
            />
          ) : (
            agent.allowedVariables.map((name) => (
              <TextField
                key={name}
                label={`{{${name}}}`}
                value={values[name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                size="small"
                slotProps={{ htmlInput: { maxLength: 200 } }}
              />
            ))
          )}
          <TextField
            select
            label="Channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as 'text' | 'voice')}
            size="small"
            sx={{ maxWidth: 200 }}
          >
            <MenuItem value="text">Text (playground)</MenuItem>
            <MenuItem value="voice">Voice (calls)</MenuItem>
          </TextField>
          <div>
            <Button
              variant="contained"
              onClick={() => preview.mutate()}
              disabled={preview.isPending || (source === 'contact' && !contact)}
            >
              Show prompt
            </Button>
          </div>
          {preview.isError && <Alert severity="error">{getErrorMessage(preview.error)}</Alert>}
          {preview.data && (
            <>
              {preview.data.warnings.length > 0 && (
                <Alert severity="warning">
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {preview.data.warnings.map((w) => (
                      <li key={w}>{warningText(w)}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2">
                  Instructions ({preview.data.instructions.length.toLocaleString('en-IN')}{' '}
                  characters)
                </Typography>
                <CopyButton value={preview.data.instructions} label="Copy instructions" />
              </Stack>
              <Box
                component="pre"
                aria-label="Compiled instructions"
                sx={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  bgcolor: 'action.hover',
                  p: 1.5,
                  borderRadius: 1,
                  maxHeight: 420,
                  overflow: 'auto',
                  m: 0,
                }}
              >
                {preview.data.instructions}
              </Box>
              <Typography variant="subtitle2">Tools the AI can use</Typography>
              {preview.data.tools.length ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {preview.data.tools.map((t) => (
                    <li key={t.name}>
                      <Typography variant="body2">
                        <strong>{t.name}</strong> — {t.description.split('\n')[0]}
                      </Typography>
                    </li>
                  ))}
                </ul>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  None
                </Typography>
              )}
            </>
          )}
        </Stack>
      </Box>
    </Drawer>
  );
}
