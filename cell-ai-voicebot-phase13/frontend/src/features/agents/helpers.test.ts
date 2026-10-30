import { describe, expect, it } from 'vitest';

import { formatBytes, uploadProblem } from '@/features/knowledge/queries';
import { fakeAgent } from '@/test/agents';

import { formFieldOf, formProblems, tabOfField, toForm, toPatch } from './agent-form';
import { countErrors, warningText } from './editor/editor-context';
import {
  emptyDraft,
  hostOf,
  prettyResult,
  testArgs,
  toDraft,
  toFunctionInput,
  toolErrorText,
} from './functions/function-draft';

describe('agent form helpers', () => {
  it('round-trips an agent and sends only changed fields', () => {
    const agent = fakeAgent({
      description: null,
      limits: { dailySpendCapMicros: 50_500_000, monthlySpendCapMicros: 0, onCap: 'stop' },
      toneRules: [{ when: 'custom', customWhen: 'customer cries', respond: 'Main samajhta hoon' }],
    });
    const form = toForm(agent);
    expect(form.description).toBe('');
    expect(form.limits).toEqual({ daily: '50.50', monthly: '', onCap: 'stop' });
    expect(toPatch(form, form)).toEqual({});
    expect(toPatch(form, { ...form, description: '  ' })).toEqual({});
    expect(toPatch(form, { ...form, description: 'Hi' })).toEqual({ description: 'Hi' });
    expect(
      toPatch(form, { ...form, toneRules: [{ when: 'angry', customWhen: 'x', respond: 'Calm' }] }),
    ).toEqual({
      toneRules: [{ when: 'angry', respond: 'Calm' }],
    });
    expect(toPatch(form, { ...form, limits: { ...form.limits, monthly: '1,000' } })).toEqual({
      limits: {
        dailySpendCapMicros: 50_500_000,
        monthlySpendCapMicros: 1_000_000_000,
        onCap: 'stop',
      },
    });
  });

  it('finds client problems and maps server paths', () => {
    const form = toForm(fakeAgent());
    expect(formProblems(form)).toEqual({});
    expect(
      formProblems({
        ...form,
        limits: { daily: 'x', monthly: '2,00,000', onCap: 'fallback' },
        toneRules: [{ when: 'custom', customWhen: ' ', respond: 'r' }],
      }),
    ).toEqual({
      'limits.daily': 'Enter an amount like 1,500 or 1500.50',
      'limits.monthly': 'Maximum is ₹1,00,000',
      'toneRules.0.customWhen': 'Describe when this applies',
    });
    expect(formFieldOf('body.limits.dailySpendCapMicros')).toBe('limits.daily');
    expect(formFieldOf('limits.monthlySpendCapMicros')).toBe('limits.monthly');
    expect(formFieldOf('body.persona')).toBe('persona');
    expect(tabOfField('model.textModel')).toBe('limits');
    expect(tabOfField('toneRules.1.respond')).toBe('voice');
    expect(tabOfField('functions')).toBeNull();
  });

  it('counts error leaves and explains warnings', () => {
    expect(countErrors({ a: { message: 'x' }, b: [{ c: { message: 'y' } }, undefined] })).toBe(2);
    expect(countErrors(null)).toBe(0);
    expect(warningText('missing_variable:amount')).toBe(
      'No value for {{amount}} — it is left empty',
    );
    expect(warningText('something_else')).toBe('something_else');
  });
});

describe('function draft helpers', () => {
  const fn = {
    id: 'f1',
    name: 'pay',
    description: 'Pays things',
    parameters: [
      {
        name: 'kind',
        type: 'enum' as const,
        description: '',
        required: true,
        enumValues: ['a', 'b'],
      },
    ],
    method: 'POST' as const,
    url: 'https://api.example.com:8443/x?{{args.kind}}',
    headers: [
      { name: 'X-Key', secret: true, value: null, valueHint: '••••1234' },
      { name: 'X-Plain', secret: false, value: 'v', valueHint: null },
    ],
    bodyTemplate: '{"k":"{{args.kind}}"}',
    resultPath: 'data',
    responseHint: 'hint',
    timeoutMs: 2500,
  };

  it('turns a function into a draft and back (stored secret kept)', () => {
    const draft = toDraft(fn);
    expect(draft.parameters[0]?.enumText).toBe('a, b');
    expect(draft.timeoutSec).toBe('2.5');
    expect(toFunctionInput(draft)).toEqual({
      name: 'pay',
      description: 'Pays things',
      parameters: [
        { name: 'kind', type: 'enum', description: '', required: true, enumValues: ['a', 'b'] },
      ],
      method: 'POST',
      url: fn.url,
      headers: [
        { name: 'X-Key', secret: true, value: null },
        { name: 'X-Plain', secret: false, value: 'v' },
      ],
      bodyTemplate: fn.bodyTemplate,
      resultPath: 'data',
      responseHint: 'hint',
      timeoutMs: 2500,
    });
    expect(toFunctionInput({ ...draft, method: 'GET' }).bodyTemplate).toBeNull();
    expect(toFunctionInput(emptyDraft())).toMatchObject({
      method: 'GET',
      url: 'https://',
      bodyTemplate: null,
      resultPath: null,
      timeoutMs: 6000,
    });
  });

  it('formats hosts, errors and results; types test arguments', () => {
    expect(hostOf(fn.url)).toBe('api.example.com:8443');
    expect(hostOf('not a url')).toBe('not a url');
    expect(toolErrorText(null)).toBeNull();
    expect(toolErrorText('http_503')).toBe('The API answered with HTTP 503');
    for (const code of [
      'timeout',
      'too_large',
      'invalid_json',
      'network',
      'too_many_redirects',
      'invalid_request',
      'secret_unavailable',
    ]) {
      expect(toolErrorText(code)).not.toBe(code);
    }
    expect(toolErrorText('weird')).toBe('weird');
    expect(prettyResult('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyResult('plain')).toBe('plain');
    expect(
      testArgs(
        [
          { name: 'n', type: 'number', description: '', required: true },
          { name: 'i', type: 'integer', description: '', required: false },
          { name: 'b', type: 'boolean', description: '', required: true },
          { name: 's', type: 'string', description: '', required: false },
        ],
        { n: '2.5', b: 'true' },
      ),
    ).toEqual({ n: 2.5, b: true });
    expect(testArgs([{ name: 'n', type: 'integer', description: '', required: true }], {})).toEqual(
      { n: '' },
    );
  });
});

describe('knowledge helpers', () => {
  it('checks uploads and formats sizes', () => {
    expect(uploadProblem([])).toBe('Choose at least one file');
    expect(uploadProblem(Array.from({ length: 6 }, (_, i) => new File(['x'], `f${i}.txt`)))).toBe(
      'Upload at most 5 files at a time',
    );
    expect(uploadProblem([new File(['x'], 'a.PDF'), new File(['y'], 'b.md')])).toBeNull();
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
