import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { JsonTemplateField } from '@/components/fields/JsonTemplateField';
import { SecretField } from '@/components/fields/SecretField';

import { newId } from '../../graph/ids';
import { NumberInput, SelectInput, TemplateField } from '../fields';
import { move, num, OPERATOR_LABELS, rows, str, type StepFormProps } from '../form-types';

const update = <T extends Record<string, unknown>>(items: T[], i: number, patch: Partial<T>): T[] =>
  items.map((x, j) => (j === i ? { ...x, ...patch } : x));

export function ApiRequestForm({
  config,
  set,
  errors,
  variables,
  flowVariables,
  catalog,
  readOnly,
}: StepFormProps) {
  const method = str(config.method, 'GET');
  const headers = rows(config.headers);
  const saves = rows(config.saveResponse);
  const setHeaders = (next: Record<string, unknown>[]) => set({ headers: next });
  const setSaves = (next: Record<string, unknown>[]) => set({ saveResponse: next });
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1}>
        <SelectInput
          label="Method"
          value={method}
          onChange={(m) => set(m === 'GET' ? { method: m, bodyTemplate: null } : { method: m })}
          options={catalog.httpMethods.map((m) => ({ value: m, label: m }))}
          readOnly={readOnly}
        />
      </Stack>
      <TemplateField
        label="URL"
        value={str(config.url)}
        onChange={(url) => set({ url })}
        variables={variables}
        error={errors.url}
        maxLength={2000}
        helperText="HTTPS only. Private and internal addresses are blocked."
        readOnly={readOnly}
      />
      <Typography variant="subtitle2">Headers</Typography>
      {headers.map((h, i) => (
        <Stack
          key={String(i)}
          spacing={1}
          sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField
              size="small"
              label="Header name"
              value={str(h.name)}
              onChange={(e) => setHeaders(update(headers, i, { name: e.target.value }))}
              error={Boolean(errors[`headers.${String(i)}.name`])}
              helperText={errors[`headers.${String(i)}.name`]}
              disabled={readOnly}
              fullWidth
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
            {!readOnly && (
              <IconButton
                size="small"
                aria-label={`Remove header ${str(h.name) || String(i + 1)}`}
                onClick={() => setHeaders(headers.filter((_x, j) => j !== i))}
              >
                <DeleteOutlineOutlined fontSize="small" />
              </IconButton>
            )}
          </Stack>
          {h.secret === true ? (
            <SecretField
              label="Secret value"
              hint={typeof h.valueHint === 'string' ? h.valueHint : null}
              value={typeof h.value === 'string' ? h.value : null}
              onChange={(value) => setHeaders(update(headers, i, { value }))}
              disabled={readOnly}
            />
          ) : (
            <TemplateField
              label="Value"
              value={str(h.value)}
              onChange={(value) => setHeaders(update(headers, i, { value }))}
              variables={variables}
              maxLength={2000}
              readOnly={readOnly}
            />
          )}
          {!readOnly && (
            <Button
              size="small"
              sx={{ alignSelf: 'flex-start' }}
              onClick={() =>
                setHeaders(
                  update(
                    headers,
                    i,
                    h.secret === true
                      ? { secret: false, value: '', sealed: undefined, valueHint: undefined }
                      : { secret: true, value: '' },
                  ),
                )
              }
            >
              {h.secret === true ? 'Make it a normal value' : 'Make it secret'}
            </Button>
          )}
        </Stack>
      ))}
      {!readOnly && headers.length < 10 && (
        <Button
          size="small"
          sx={{ alignSelf: 'flex-start' }}
          onClick={() => setHeaders([...headers, { name: '', secret: false, value: '' }])}
        >
          Add header
        </Button>
      )}
      {method !== 'GET' && (
        <JsonTemplateField
          label="Body (JSON, {{variables}} allowed)"
          value={str(config.bodyTemplate)}
          onChange={(bodyTemplate) =>
            set({ bodyTemplate: bodyTemplate.trim() ? bodyTemplate : null })
          }
          disabled={readOnly}
          {...(errors.bodyTemplate ? { error: errors.bodyTemplate } : {})}
        />
      )}
      <NumberInput
        label="Timeout (seconds)"
        value={num(config.timeoutMs, 6000) / 1000}
        onChange={(s) => set({ timeoutMs: Math.round(s * 1000) })}
        min={1}
        max={10}
        error={errors.timeoutMs}
        readOnly={readOnly}
      />
      <Typography variant="subtitle2">Save from the response</Typography>
      {saves.map((s, i) => (
        <Stack key={String(i)} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TextField
            size="small"
            label="Response field"
            placeholder="data.status"
            value={str(s.path)}
            onChange={(e) => setSaves(update(saves, i, { path: e.target.value }))}
            error={Boolean(errors[`saveResponse.${String(i)}.path`])}
            helperText={errors[`saveResponse.${String(i)}.path`]}
            disabled={readOnly}
          />
          <SelectInput
            label="Into"
            value={str(s.variable)}
            onChange={(variable) => setSaves(update(saves, i, { variable }))}
            options={[
              { value: '', label: 'Choose' },
              ...flowVariables.map((v) => ({ value: v.name, label: v.name })),
            ]}
            error={errors[`saveResponse.${String(i)}.variable`]}
            readOnly={readOnly}
          />
          {!readOnly && (
            <IconButton
              size="small"
              aria-label={`Remove saved field ${String(i + 1)}`}
              onClick={() => setSaves(saves.filter((_x, j) => j !== i))}
            >
              <DeleteOutlineOutlined fontSize="small" />
            </IconButton>
          )}
        </Stack>
      ))}
      {!readOnly && saves.length < 10 && (
        <Button
          size="small"
          sx={{ alignSelf: 'flex-start' }}
          onClick={() => setSaves([...saves, { path: '', variable: '' }])}
        >
          Add field to save
        </Button>
      )}
    </Stack>
  );
}

export function RouterForm({ config, set, errors, allNames, catalog, readOnly }: StepFormProps) {
  const rules = rows(config.rules);
  const setRules = (next: Record<string, unknown>[]) => set({ rules: next });
  const needsValue = new Map(catalog.operators.map((o) => [o.operator, o.needsValue]));
  const nameOptions = [
    { value: '', label: 'Choose' },
    ...allNames.map((n) => ({ value: n, label: n })),
  ];
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Rules are checked top to bottom; the first match wins. Otherwise the call takes “Else”.
      </Typography>
      {errors.rules && <Alert severity="error">{errors.rules}</Alert>}
      {rules.map((rule, i) => {
        const conditions = rows(rule.conditions);
        const setConditions = (next: Record<string, unknown>[]) =>
          setRules(update(rules, i, { conditions: next }));
        return (
          <Stack
            key={str(rule.id, String(i))}
            spacing={1}
            sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField
                size="small"
                label={`Rule ${String(i + 1)} name`}
                value={str(rule.label)}
                onChange={(e) => setRules(update(rules, i, { label: e.target.value }))}
                disabled={readOnly}
                fullWidth
                slotProps={{ htmlInput: { maxLength: 60 } }}
              />
              {!readOnly && (
                <>
                  <Button
                    size="small"
                    onClick={() => setRules(move(rules, i, i - 1))}
                    disabled={i === 0}
                    aria-label={`Move rule ${String(i + 1)} up`}
                  >
                    Up
                  </Button>
                  <IconButton
                    size="small"
                    aria-label={`Remove rule ${String(i + 1)}`}
                    onClick={() => setRules(rules.filter((_x, j) => j !== i))}
                  >
                    <DeleteOutlineOutlined fontSize="small" />
                  </IconButton>
                </>
              )}
            </Stack>
            <SelectInput
              label="Match"
              value={str(rule.match, 'all')}
              onChange={(match) => setRules(update(rules, i, { match }))}
              options={[
                { value: 'all', label: 'All conditions' },
                { value: 'any', label: 'Any condition' },
              ]}
              readOnly={readOnly}
            />
            {conditions.map((c, k) => {
              const operator = str(c.operator, 'equals');
              const prefix = `rules.${String(i)}.conditions.${String(k)}`;
              return (
                <Stack
                  key={String(k)}
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'flex-start' }}
                >
                  <SelectInput
                    label="Value of"
                    value={str(c.variable)}
                    onChange={(variable) => setConditions(update(conditions, k, { variable }))}
                    options={nameOptions}
                    error={errors[`${prefix}.variable`]}
                    readOnly={readOnly}
                  />
                  <SelectInput
                    label="Operator"
                    value={operator}
                    onChange={(op) =>
                      setConditions(
                        update(
                          conditions,
                          k,
                          needsValue.get(op) === false
                            ? { operator: op, value: null }
                            : { operator: op },
                        ),
                      )
                    }
                    options={catalog.operators.map((o) => ({
                      value: o.operator,
                      label: OPERATOR_LABELS[o.operator] ?? o.operator,
                    }))}
                    readOnly={readOnly}
                  />
                  {needsValue.get(operator) !== false && (
                    <TextField
                      size="small"
                      label="Value"
                      value={str(c.value)}
                      onChange={(e) =>
                        setConditions(update(conditions, k, { value: e.target.value }))
                      }
                      error={Boolean(errors[`${prefix}.value`])}
                      helperText={errors[`${prefix}.value`]}
                      disabled={readOnly}
                      slotProps={{ htmlInput: { maxLength: 300 } }}
                    />
                  )}
                  {!readOnly && conditions.length > 1 && (
                    <IconButton
                      size="small"
                      aria-label={`Remove condition ${String(k + 1)} of rule ${String(i + 1)}`}
                      onClick={() => setConditions(conditions.filter((_x, j) => j !== k))}
                    >
                      <DeleteOutlineOutlined fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
              );
            })}
            {!readOnly && conditions.length < 5 && (
              <Button
                size="small"
                sx={{ alignSelf: 'flex-start' }}
                onClick={() =>
                  setConditions([...conditions, { variable: '', operator: 'equals', value: '' }])
                }
              >
                Add condition
              </Button>
            )}
          </Stack>
        );
      })}
      {!readOnly && rules.length < 10 && (
        <Button
          size="small"
          sx={{ alignSelf: 'flex-start' }}
          onClick={() =>
            setRules([
              ...rules,
              {
                id: newId(),
                label: '',
                match: 'all',
                conditions: [{ variable: '', operator: 'equals', value: '' }],
              },
            ])
          }
        >
          Add rule
        </Button>
      )}
    </Stack>
  );
}

export function SetVariableForm({
  config,
  set,
  errors,
  variables,
  flowVariables,
  readOnly,
}: StepFormProps) {
  const items = rows(config.assignments);
  const setItems = (next: Record<string, unknown>[]) => set({ assignments: next });
  const typeOf = new Map(flowVariables.map((v) => [v.name, v.type]));
  return (
    <Stack spacing={2}>
      {errors.assignments && <Alert severity="error">{errors.assignments}</Alert>}
      {flowVariables.length === 0 && (
        <Alert severity="info">Add a flow variable first (Variables button in the toolbar).</Alert>
      )}
      {items.map((a, i) => {
        const op = str(a.op, 'set');
        const name = str(a.variable);
        const ops = [
          { value: 'set', label: 'Set to' },
          ...(typeOf.get(name) === 'number' ? [{ value: 'increment', label: 'Add' }] : []),
          { value: 'clear', label: 'Clear' },
        ];
        return (
          <Stack
            key={String(i)}
            spacing={1}
            sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <SelectInput
                label="Variable"
                value={name}
                onChange={(variable) =>
                  setItems(
                    update(
                      items,
                      i,
                      typeOf.get(variable) !== 'number' && op === 'increment'
                        ? { variable, op: 'set' }
                        : { variable },
                    ),
                  )
                }
                options={[
                  { value: '', label: 'Choose' },
                  ...flowVariables.map((v) => ({ value: v.name, label: v.name })),
                ]}
                error={errors[`assignments.${String(i)}.variable`]}
                readOnly={readOnly}
              />
              <SelectInput
                label="Action"
                value={op}
                onChange={(next) =>
                  setItems(
                    update(items, i, next === 'clear' ? { op: next, value: null } : { op: next }),
                  )
                }
                options={ops}
                readOnly={readOnly}
              />
              {!readOnly && (
                <IconButton
                  size="small"
                  aria-label={`Remove assignment ${String(i + 1)}`}
                  onClick={() => setItems(items.filter((_x, j) => j !== i))}
                >
                  <DeleteOutlineOutlined fontSize="small" />
                </IconButton>
              )}
            </Stack>
            {op !== 'clear' && (
              <TemplateField
                label={op === 'increment' ? 'Amount' : 'Value'}
                value={str(a.value)}
                onChange={(value) => setItems(update(items, i, { value }))}
                variables={variables}
                error={errors[`assignments.${String(i)}.value`]}
                maxLength={1000}
                readOnly={readOnly}
              />
            )}
          </Stack>
        );
      })}
      {!readOnly && items.length < 10 && (
        <Button
          size="small"
          sx={{ alignSelf: 'flex-start' }}
          onClick={() => setItems([...items, { variable: '', op: 'set', value: '' }])}
        >
          Add assignment
        </Button>
      )}
    </Stack>
  );
}
