import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRef } from 'react';
import { Controller, useWatch } from 'react-hook-form';

import { VariablePicker, type PickerVariable } from '@/components/fields/VariablePicker';

import type { EditorTabProps } from './editor-context';

const PERSONA_MAX = 8000;

/** A text field with "Insert variable" for `{{…}}` placeholders. */
function TemplatedField({
  name,
  label,
  form,
  variables,
  readOnly,
  multiline,
  rows,
  maxLength,
  helperText,
}: Pick<EditorTabProps, 'form' | 'readOnly'> & {
  name: 'persona' | 'openingLine' | 'closingLine' | 'guardrails.disclosureLine';
  label: string;
  variables: PickerVariable[];
  multiline?: boolean;
  rows?: number;
  maxLength: number;
  helperText?: string;
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Stack spacing={0.5}>
          <TextField
            label={label}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            inputRef={(el: HTMLInputElement | HTMLTextAreaElement | null) => {
              ref.current = el;
              field.ref(el);
            }}
            multiline={multiline}
            minRows={rows}
            fullWidth
            disabled={readOnly}
            error={Boolean(fieldState.error)}
            helperText={
              fieldState.error?.message ??
              `${helperText ? `${helperText} · ` : ''}${field.value.length.toLocaleString('en-IN')} / ${maxLength.toLocaleString('en-IN')}`
            }
            slotProps={{ htmlInput: { maxLength } }}
          />
          {!readOnly && (
            <div>
              <VariablePicker
                variables={variables}
                value={field.value}
                onChange={field.onChange}
                inputRef={ref}
              />
            </div>
          )}
        </Stack>
      )}
    />
  );
}

/** Basic: name, persona, lines, allowed variables, compliance and guardrails. */
export function BasicTab({ form, catalog, readOnly }: EditorTabProps) {
  const allowed = useWatch({ control: form.control, name: 'allowedVariables' });
  const info = new Map((catalog?.variables ?? []).map((v) => [v.name, v]));
  const variables: PickerVariable[] = [
    { name: 'company', label: 'Company', hint: 'Your account name' },
    ...allowed.map((name) => ({
      name,
      label: info.get(name)?.label ?? name,
      hint: info.get(name)?.label,
    })),
  ];
  const { errors } = form.formState;

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <TextField
            label="Name"
            {...form.register('name')}
            disabled={readOnly}
            error={Boolean(errors.name)}
            helperText={errors.name?.message}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <TextField
            label="Description (only your team sees it)"
            {...form.register('description')}
            disabled={readOnly}
            error={Boolean(errors.description)}
            helperText={errors.description?.message}
            slotProps={{ htmlInput: { maxLength: 300 } }}
          />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" component="h2">
            What the agent does
          </Typography>
          <TemplatedField
            name="persona"
            label="Persona and instructions"
            form={form}
            variables={variables}
            readOnly={readOnly}
            multiline
            rows={8}
            maxLength={PERSONA_MAX}
            helperText="Who the agent is, what it should achieve, what it may and may not do"
          />
          <TemplatedField
            name="openingLine"
            label="Opening line"
            form={form}
            variables={variables}
            readOnly={readOnly}
            maxLength={500}
          />
          <TemplatedField
            name="closingLine"
            label="Closing line"
            form={form}
            variables={variables}
            readOnly={readOnly}
            maxLength={500}
          />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" component="h2">
            Customer data the AI may see
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Only these contact fields are sent to the AI. Full phone numbers never are — functions
            can still use them on our server.
          </Typography>
          <Controller
            control={form.control}
            name="allowedVariables"
            render={({ field, fieldState }) => (
              <Autocomplete
                multiple
                options={(catalog?.variables ?? []).map((v) => v.name)}
                value={field.value}
                onChange={(_e, v) => field.onChange(v)}
                getOptionLabel={(name) => `${info.get(name)?.label ?? name} ({{${name}}})`}
                disabled={readOnly}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Allowed variables"
                    error={Boolean(fieldState.error)}
                    helperText={
                      fieldState.error?.message ??
                      'Built-ins: name, last 4 digits of the phone; plus your contact fields'
                    }
                  />
                )}
              />
            )}
          />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" component="h2">
            Compliance and guardrails
          </Typography>
          <Controller
            control={form.control}
            name="guardrails.complianceMode"
            render={({ field }) => (
              <FormControl disabled={readOnly}>
                <FormLabel id="compliance-label">Compliance mode</FormLabel>
                <RadioGroup
                  row
                  aria-labelledby="compliance-label"
                  value={field.value}
                  onChange={field.onChange}
                >
                  <FormControlLabel
                    value="recovery"
                    control={<Radio />}
                    label="Loan recovery (RBI fair-practice rules)"
                  />
                  <FormControlLabel value="general" control={<Radio />} label="General" />
                </RadioGroup>
              </FormControl>
            )}
          />
          <TemplatedField
            name="guardrails.disclosureLine"
            label="AI disclosure line"
            form={form}
            variables={variables}
            readOnly={readOnly}
            maxLength={500}
            helperText="Said near the start so the customer knows it is an AI assistant"
          />
          <Controller
            control={form.control}
            name="guardrails.neverSay"
            render={({ field, fieldState }) => (
              <Autocomplete
                multiple
                freeSolo
                options={[]}
                value={field.value}
                onChange={(_e, v) => field.onChange(v.map((x) => x.trim()).filter(Boolean))}
                disabled={readOnly}
                renderValue={(value, getItemProps) =>
                  value.map((option, index) => {
                    const { key, ...rest } = getItemProps({ index });
                    return <Chip key={key} label={option} size="small" {...rest} />;
                  })
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Never say"
                    placeholder="Type a phrase and press Enter"
                    error={Boolean(fieldState.error)}
                    helperText={
                      fieldState.error?.message ?? 'Replies containing these phrases are blocked'
                    }
                  />
                )}
              />
            )}
          />
        </Stack>
      </Paper>
    </Stack>
  );
}
