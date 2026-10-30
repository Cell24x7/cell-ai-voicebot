import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined';
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import { newId } from '../../graph/ids';
import { NumberInput, PromptEditor, SelectInput, TemplateField } from '../fields';
import { LANGUAGE_LABELS, move, num, rows, str, strings, type StepFormProps } from '../form-types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '#'];

/** Retry / timeout / apology texts shared by both gathers. */
function RetrySettings({
  config,
  set,
  errors,
  variables,
  readOnly,
  defaultTimeout,
}: StepFormProps & { defaultTimeout: number }) {
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1}>
        <NumberInput
          label="Wait (seconds)"
          value={num(config.timeoutSec, defaultTimeout)}
          onChange={(timeoutSec) => set({ timeoutSec })}
          min={3}
          max={30}
          error={errors.timeoutSec}
          readOnly={readOnly}
        />
        <NumberInput
          label="Retries"
          value={num(config.maxRetries, 2)}
          onChange={(maxRetries) => set({ maxRetries })}
          min={0}
          max={5}
          error={errors.maxRetries}
          readOnly={readOnly}
        />
      </Stack>
      <TemplateField
        label="When nothing is heard"
        value={str(config.noInputText)}
        onChange={(noInputText) => set({ noInputText })}
        variables={variables}
        error={errors.noInputText}
        maxLength={300}
        readOnly={readOnly}
      />
      <TemplateField
        label="When the answer is not valid"
        value={str(config.invalidText)}
        onChange={(invalidText) => set({ invalidText })}
        variables={variables}
        error={errors.invalidText}
        maxLength={300}
        readOnly={readOnly}
      />
    </Stack>
  );
}

const flowVarOptions = (props: StepFormProps) => [
  { value: '', label: 'Don’t save' },
  ...props.flowVariables.map((v) => ({ value: v.name, label: `${v.name} (${v.type})` })),
];

export function GatherDtmfForm(props: StepFormProps) {
  const { config, set, errors, variables, readOnly } = props;
  const mode = config.mode === 'digits' ? 'digits' : 'menu';
  const keys = rows(config.keys);
  const used = new Set(keys.map((k) => str(k.key)));
  const setKeys = (next: Record<string, unknown>[]) => set({ keys: next });
  const dup = keys.length !== used.size;
  return (
    <Stack spacing={2}>
      <PromptEditor
        value={(config.prompt ?? {}) as Record<string, unknown>}
        onChange={(prompt) => set({ prompt })}
        variables={variables}
        errors={errors}
        readOnly={readOnly}
      />
      <ToggleButtonGroup
        size="small"
        exclusive
        value={mode}
        onChange={(_e, m: string | null) => m && set({ mode: m })}
        aria-label="Keypad mode"
        disabled={readOnly}
      >
        <ToggleButton value="menu">Menu keys</ToggleButton>
        <ToggleButton value="digits">Collect digits</ToggleButton>
      </ToggleButtonGroup>
      {mode === 'menu' ? (
        <Stack spacing={1}>
          {keys.map((k, i) => (
            <Stack
              key={str(k.id, String(i))}
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center' }}
            >
              <TextField
                select
                size="small"
                label="Key"
                value={str(k.key)}
                onChange={(e) =>
                  setKeys(keys.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                }
                disabled={readOnly}
                sx={{ width: 80 }}
                slotProps={{ select: { native: true } }}
              >
                {KEYS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Meaning"
                value={str(k.label)}
                onChange={(e) =>
                  setKeys(keys.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
                disabled={readOnly}
                slotProps={{ htmlInput: { maxLength: 60 } }}
              />
              {!readOnly && (
                <>
                  <IconButton
                    size="small"
                    aria-label={`Move key ${String(i + 1)} up`}
                    onClick={() => setKeys(move(keys, i, i - 1))}
                    disabled={i === 0}
                  >
                    <ArrowUpwardOutlined fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label={`Remove key ${str(k.key)}`}
                    onClick={() => setKeys(keys.filter((_x, j) => j !== i))}
                  >
                    <DeleteOutlineOutlined fontSize="small" />
                  </IconButton>
                </>
              )}
            </Stack>
          ))}
          {dup && <Alert severity="error">Each key can be used once.</Alert>}
          {errors.keys && <Alert severity="error">{errors.keys}</Alert>}
          {!readOnly && keys.length < 12 && (
            <Button
              size="small"
              sx={{ alignSelf: 'flex-start' }}
              onClick={() =>
                setKeys([
                  ...keys,
                  { id: newId(), key: KEYS.find((k) => !used.has(k)) ?? '1', label: '' },
                ])
              }
            >
              Add key
            </Button>
          )}
          <SelectInput
            label="Repeat the question with"
            value={str(config.repeatKey)}
            onChange={(r) => set({ repeatKey: r || null })}
            options={[
              { value: '', label: 'No repeat key' },
              ...KEYS.map((k) => ({ value: k, label: k })),
            ]}
            error={errors.repeatKey}
            readOnly={readOnly}
          />
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            <NumberInput
              label="Min digits"
              value={num(config.minDigits, 1)}
              onChange={(minDigits) => set({ minDigits })}
              min={1}
              max={20}
              error={errors.minDigits}
              readOnly={readOnly}
            />
            <NumberInput
              label="Max digits"
              value={num(config.maxDigits, 4)}
              onChange={(maxDigits) => set({ maxDigits })}
              min={1}
              max={20}
              error={errors.maxDigits}
              readOnly={readOnly}
            />
          </Stack>
          <SelectInput
            label="Finish key"
            value={str(config.finishKey, '#')}
            onChange={(finishKey) => set({ finishKey })}
            options={[
              { value: '#', label: '# ends the input' },
              { value: 'none', label: 'None (max digits or timeout)' },
            ]}
            readOnly={readOnly}
          />
        </Stack>
      )}
      <SelectInput
        label="Save the key(s) in"
        value={str(config.saveAs)}
        onChange={(s) => set({ saveAs: s || null })}
        options={flowVarOptions(props)}
        error={errors.saveAs}
        readOnly={readOnly}
      />
      <Divider />
      <RetrySettings {...props} defaultTimeout={7} />
    </Stack>
  );
}

export function GatherSpeechForm(props: StepFormProps) {
  const { config, set, errors, variables, catalog, readOnly } = props;
  const intents = rows(config.intents);
  const setIntents = (next: Record<string, unknown>[]) => set({ intents: next });
  return (
    <Stack spacing={2}>
      <PromptEditor
        value={(config.prompt ?? {}) as Record<string, unknown>}
        onChange={(prompt) => set({ prompt })}
        variables={variables}
        errors={errors}
        readOnly={readOnly}
      />
      <SelectInput
        label="Save the answer in"
        value={str(config.saveAs)}
        onChange={(s) => set({ saveAs: s || null })}
        options={flowVarOptions(props)}
        error={errors.saveAs}
        readOnly={readOnly}
      />
      <SelectInput
        label="Language"
        value={str(config.language, 'flow')}
        onChange={(language) => set({ language })}
        options={catalog.speechLanguages.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] ?? l }))}
        readOnly={readOnly}
      />
      <Typography variant="subtitle2">Intents (optional)</Typography>
      {intents.map((intent, i) => (
        <Stack
          key={str(intent.id, String(i))}
          spacing={1}
          sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField
              size="small"
              label="Intent"
              value={str(intent.label)}
              onChange={(e) =>
                setIntents(intents.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
              }
              error={Boolean(errors[`intents.${String(i)}.label`])}
              disabled={readOnly}
              fullWidth
              slotProps={{ htmlInput: { maxLength: 60 } }}
            />
            {!readOnly && (
              <>
                <IconButton
                  size="small"
                  aria-label={`Move intent ${String(i + 1)} down`}
                  onClick={() => setIntents(move(intents, i, i + 1))}
                  disabled={i === intents.length - 1}
                >
                  <ArrowDownwardOutlined fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={`Remove intent ${str(intent.label) || String(i + 1)}`}
                  onClick={() => setIntents(intents.filter((_x, j) => j !== i))}
                >
                  <DeleteOutlineOutlined fontSize="small" />
                </IconButton>
              </>
            )}
          </Stack>
          <Autocomplete
            multiple
            freeSolo
            options={[]}
            value={strings(intent.keywords)}
            onChange={(_e, value) =>
              setIntents(
                intents.map((x, j) =>
                  j === i
                    ? {
                        ...x,
                        keywords: value
                          .map((v) => v.trim())
                          .filter(Boolean)
                          .slice(0, 20),
                      }
                    : x,
                ),
              )
            }
            renderValue={(value, getItemProps) =>
              value.map((option, index) => (
                <Chip size="small" label={option} {...getItemProps({ index })} key={option} />
              ))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label="Keywords"
                helperText={
                  errors[`intents.${String(i)}.keywords`] ??
                  'Type a word or phrase and press Enter (Hinglish / हिंदी)'
                }
                error={Boolean(errors[`intents.${String(i)}.keywords`])}
              />
            )}
            disabled={readOnly}
          />
        </Stack>
      ))}
      {!readOnly && intents.length < 10 && (
        <Button
          size="small"
          sx={{ alignSelf: 'flex-start' }}
          onClick={() => setIntents([...intents, { id: newId(), label: '', keywords: [] }])}
        >
          Add intent
        </Button>
      )}
      {intents.length > 0 && (
        <SelectInput
          label="Match intents by"
          value={str(config.matchMode, 'keywords')}
          onChange={(matchMode) => set({ matchMode })}
          options={[
            { value: 'keywords', label: 'Keywords (free, exact words)' },
            { value: 'ai', label: 'AI (understands meaning, costs a little per answer)' },
          ]}
          readOnly={readOnly}
        />
      )}
      <Divider />
      <RetrySettings {...props} defaultTimeout={8} />
    </Stack>
  );
}
