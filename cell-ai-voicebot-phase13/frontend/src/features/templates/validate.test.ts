import { describe, expect, it } from 'vitest';

import formatCases from '@/test/fixtures/template-format-cases.json';
import shared from '@/test/fixtures/template-validate-cases.json';
import { formatFieldValue } from '@/utils/format';
import { formatPhone } from '@/utils/phone';

import { TEMPLATE_LIMITS } from './limits';
import { errorMap, validateTemplate, type TemplateDraft } from './validate';

const body = (text: string, example?: unknown) => ({
  type: 'BODY',
  text,
  ...(example ? { example } : {}),
});
const draft = (over: Partial<TemplateDraft> = {}): TemplateDraft => ({
  name: 'emi_reminder',
  language: 'en',
  category: 'UTILITY',
  parameterFormat: 'positional',
  components: [body('Your EMI is due soon.')],
  ...over,
});
const paths = (input: TemplateDraft) =>
  validateTemplate(input)
    .map((e) => e.path)
    .sort();
const withButtons = (...buttons: Record<string, unknown>[]) =>
  draft({ components: [body('Pay today.'), { type: 'BUTTONS', buttons }] });

describe('validateTemplate — the backend shared cases (tests/fixtures/template-validate-cases.json)', () => {
  it.each(shared.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(paths(c.input as TemplateDraft)).toEqual(c.paths);
  });
});

describe('validateTemplate — field rules the server checks in its schema', () => {
  it('limits the name, header, body, footer and button lengths', () => {
    expect(paths(draft({ name: 'a'.repeat(TEMPLATE_LIMITS.nameMax + 1) }))).toEqual(['name']);
    expect(
      paths(
        draft({
          components: [
            { type: 'HEADER', format: 'TEXT', text: 'h'.repeat(61) },
            body('b'.repeat(1025)),
            { type: 'FOOTER', text: 'f'.repeat(61) },
          ],
        }),
      ),
    ).toEqual(['components.body.text', 'components.footer.text', 'components.header.text']);
    expect(paths(draft({ components: [body('')] }))).toEqual(['components.body.text']);
    expect(paths(withButtons({ type: 'QUICK_REPLY', text: 'q'.repeat(26) }))).toEqual([
      'components.buttons.0.text',
    ]);
    expect(paths(withButtons({ type: 'QUICK_REPLY', text: '' }))).toEqual([
      'components.buttons.0.text',
    ]);
  });

  it('checks URLs, phone numbers and copy codes', () => {
    expect(paths(withButtons({ type: 'URL', text: 'Pay', url: 'pay.example.com' }))).toEqual([
      'components.buttons.0.url',
    ]);
    expect(
      paths(
        withButtons({ type: 'URL', text: 'Pay', url: `https://x.example/${'a'.repeat(2000)}` }),
      ),
    ).toEqual(['components.buttons.0.url']);
    expect(
      paths(
        withButtons({
          type: 'URL',
          text: 'Pay',
          url: 'https://pay.example.com/{{1}}',
          example: ['not a url'],
        }),
      ),
    ).toEqual(['components.buttons.0.example']);
    expect(paths(withButtons({ type: 'URL', text: 'Pay', url: 'ftp://x.example' }))).toEqual([
      'components.buttons.0.url',
    ]);
    expect(
      paths(withButtons({ type: 'PHONE_NUMBER', text: 'Call', phone_number: '12-34' })),
    ).toEqual(['components.buttons.0.phone_number']);
    expect(paths(withButtons({ type: 'COPY_CODE', example: '' }))).toEqual([
      'components.buttons.0.example',
    ]);
    expect(paths(withButtons({ type: 'COPY_CODE', example: 'X'.repeat(21) }))).toEqual([
      'components.buttons.0.example',
    ]);
    expect(paths(withButtons({ type: 'VOICE_CALL', text: 'Call us' }))).toEqual([]);
  });

  it('refuses unknown components, buttons and header kinds', () => {
    expect(paths(draft({ components: [body('Hi.'), { type: 'CAROUSEL' }] }))).toEqual([
      'components',
    ]);
    expect(paths(withButtons({ type: 'OTP', text: 'Copy' }))).toEqual([
      'components.buttons.0.type',
    ]);
    expect(paths(draft({ components: [{ type: 'HEADER', format: 'GIF' }, body('Hi.')] }))).toEqual([
      'components.header.format',
    ]);
    expect(
      paths(
        draft({
          category: 'MARKETING',
          components: [{ type: 'HEADER', format: 'LOCATION' }, body('Hi.')],
        }),
      ),
    ).toEqual([]);
  });

  it('counts buttons, needs one when the group is there, and caps the components', () => {
    expect(paths(draft({ components: [body('Hi.'), { type: 'BUTTONS', buttons: [] }] }))).toEqual([
      'components.buttons',
    ]);
    const many = Array.from({ length: 11 }, (_, i) => ({
      type: 'QUICK_REPLY',
      text: `Q${String(i)}`,
    }));
    expect(paths(withButtons(...many))).toEqual(['components.buttons']);
    expect(
      paths(withButtons({ type: 'COPY_CODE', example: 'A' }, { type: 'COPY_CODE', example: 'B' })),
    ).toEqual(['components.buttons']);
    expect(
      paths(
        withButtons({ type: 'VOICE_CALL', text: 'Call' }, { type: 'VOICE_CALL', text: 'Call 2' }),
      ),
    ).toEqual(['components.buttons']);
    expect(paths(draft({ components: [] }))).toEqual(['components', 'components.body']);
    expect(
      paths(
        draft({
          components: Array.from({ length: 7 }, () => ({ type: 'FOOTER', text: 'x' })),
        }),
      ),
    ).toEqual(['components', 'components.body']);
  });

  it('keeps named header variables to the named format and reads named header examples', () => {
    const header = (example?: unknown) => ({
      type: 'HEADER',
      format: 'TEXT',
      text: 'EMI {{month}}',
      ...(example ? { example } : {}),
    });
    expect(
      paths(
        draft({
          parameterFormat: 'named',
          components: [
            header({ header_text_named_params: [{ param_name: 'month', example: 'Oct' }] }),
            body('Pay today.'),
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      paths(
        draft({
          parameterFormat: 'positional',
          components: [header({ header_text: ['Oct'] }), body('Pay.')],
        }),
      ),
    ).toEqual(['components.header.text']);
  });

  it('ttl must be a whole number', () => {
    expect(paths(draft({ ttlSeconds: 60.5 }))).toEqual(['ttlSeconds']);
  });

  it('errorMap keeps the first message per path', () => {
    expect(
      errorMap([
        { path: 'name', message: 'a' },
        { path: 'language', message: 'b' },
      ]),
    ).toEqual({ name: 'a', language: 'b' });
  });
});

describe('contact values in variables match the backend (template-format-cases.json)', () => {
  it.each(formatCases.map((c) => [c.type, c] as const))('%s', (_type, c) => {
    const text = formatFieldValue(
      c.type as Parameters<typeof formatFieldValue>[0],
      c.value,
      formatPhone,
    );
    expect(text).toBe(c.text ?? '—');
  });
});
