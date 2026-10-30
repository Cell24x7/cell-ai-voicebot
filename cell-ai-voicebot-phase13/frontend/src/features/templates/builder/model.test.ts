import { describe, expect, it } from 'vitest';

import { EMI_COMPONENTS, fakeTemplate } from '@/test/templates';

import { TEMPLATE_LIMITS } from '../limits';
import { validateTemplate } from '../validate';

import {
  addButton,
  callPermissionState,
  canAddButton,
  emptyButton,
  emptyState,
  fromTemplate,
  groupingOk,
  insertAt,
  isMediaHeader,
  moveButton,
  nextVariable,
  slugify,
  toComponents,
  type BuilderState,
  type ButtonType,
} from './model';

const types = (buttons: { type: string }[]) => buttons.map((b) => b.type);
const valid = (s: BuilderState) =>
  validateTemplate({ ...s, components: toComponents(s), purpose: s.purpose });

describe('builder model', () => {
  it('slugs typed names', () => {
    expect(slugify('EMI Reminder — Oct!')).toBe('emi_reminder_oct_');
    expect(slugify('a  b__c')).toBe('a_b_c');
    expect(slugify('x'.repeat(600))).toHaveLength(TEMPLATE_LIMITS.nameMax);
  });

  it('adds numbered and named variables without clashes', () => {
    expect(nextVariable('', 'positional')).toBe('{{1}}');
    expect(nextVariable('Hi {{1}} and {{3}}', 'positional')).toBe('{{4}}');
    expect(nextVariable('', 'named')).toBe('{{variable}}');
    expect(nextVariable('Hi {{variable}}', 'named')).toBe('{{variable_2}}');
    expect(nextVariable('Hi {{amount}} {{amount_2}}', 'named', 'Amount')).toBe('{{amount_3}}');
    expect(nextVariable('', 'named', '1st')).toBe('{{v_1st}}');
    expect(insertAt('Hi', '{{1}}')).toBe('Hi {{1}}');
    expect(insertAt('Hi there', '{{1}}', 2)).toBe('Hi {{1}} there');
    expect(insertAt('', '{{1}}')).toBe('{{1}}');
    expect(insertAt('Hi ', '{{1}}', 3)).toBe('Hi {{1}}');
  });

  it('keeps quick replies together when adding and moving buttons', () => {
    let b = addButton([], 'URL');
    b = addButton(b, 'QUICK_REPLY');
    b = addButton(b, 'QUICK_REPLY');
    b = addButton(b, 'PHONE_NUMBER');
    expect(groupingOk(b)).toBe(true);
    expect(types(b)).toEqual(['URL', 'PHONE_NUMBER', 'QUICK_REPLY', 'QUICK_REPLY']);
    // quick replies first → others go after them
    let q = addButton([], 'QUICK_REPLY');
    q = addButton(q, 'URL');
    q = addButton(q, 'QUICK_REPLY');
    expect(types(q)).toEqual(['QUICK_REPLY', 'QUICK_REPLY', 'URL']);
    // a move that splits the group is refused; one inside a group is fine
    expect(moveButton(b, 1, 1)).toBeNull();
    expect(moveButton(b, 0, 1)?.map((x) => x.type)).toEqual([
      'PHONE_NUMBER',
      'URL',
      'QUICK_REPLY',
      'QUICK_REPLY',
    ]);
    expect(moveButton(b, 2, 1)).not.toBeNull();
    expect(moveButton(b, 0, -1)).toBeNull();
    expect(moveButton(b, 3, 1)).toBeNull();
    expect(groupingOk([{ type: 'QUICK_REPLY' }, { type: 'URL' }, { type: 'QUICK_REPLY' }])).toBe(
      false,
    );
  });

  it('caps buttons per type and in total', () => {
    const caps: [ButtonType, number][] = [
      ['URL', 2],
      ['PHONE_NUMBER', 1],
      ['COPY_CODE', 1],
      ['VOICE_CALL', 1],
      ['QUICK_REPLY', 10],
    ];
    for (const [type, max] of caps) {
      const list = Array.from({ length: max }, () => emptyButton(type));
      expect(canAddButton(list.slice(0, max - 1), type)).toBe(true);
      expect(canAddButton(list, type)).toBe(false);
    }
    const ten = Array.from({ length: 10 }, () => emptyButton('QUICK_REPLY'));
    expect(canAddButton(ten, 'URL')).toBe(false);
    expect(emptyButton('VOICE_CALL').text).toBe('Call us');
    expect(isMediaHeader('image')).toBe(true);
    expect(isMediaHeader('location')).toBe(false);
  });

  it('builds Meta components for every header, body, footer and button kind', () => {
    const s = emptyState({
      name: 'emi_reminder',
      headerKind: 'text',
      headerText: 'EMI for {{1}}',
      headerExample: 'Asha',
      body: 'Namaste {{1}}, pay {{2}} today.',
      examples: { 1: 'Asha', 2: '₹100' },
      footer: 'Demo Finance',
      buttons: [
        { ...emptyButton('QUICK_REPLY'), text: 'Paid' },
        {
          ...emptyButton('URL'),
          text: 'Pay',
          url: 'https://pay.example.com/',
          dynamic: true,
          example: 'LN1',
        },
        { ...emptyButton('URL'), text: 'Site', url: 'https://example.com' },
        { ...emptyButton('PHONE_NUMBER'), text: 'Call', phone: '+919000000001' },
        { ...emptyButton('COPY_CODE'), example: 'SAVE10' },
        { ...emptyButton('VOICE_CALL'), text: 'Call us' },
      ],
    });
    expect(toComponents(s)).toEqual([
      { type: 'HEADER', format: 'TEXT', text: 'EMI for {{1}}', example: { header_text: ['Asha'] } },
      {
        type: 'BODY',
        text: 'Namaste {{1}}, pay {{2}} today.',
        example: { body_text: [['Asha', '₹100']] },
      },
      { type: 'FOOTER', text: 'Demo Finance' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Paid' },
          {
            type: 'URL',
            text: 'Pay',
            url: 'https://pay.example.com/{{1}}',
            example: ['https://pay.example.com/LN1'],
          },
          { type: 'URL', text: 'Site', url: 'https://example.com' },
          { type: 'PHONE_NUMBER', text: 'Call', phone_number: '+919000000001' },
          { type: 'COPY_CODE', example: 'SAVE10' },
          { type: 'VOICE_CALL', text: 'Call us' },
        ],
      },
    ]);
    expect(valid({ ...s, category: 'MARKETING' })).toEqual([]);
    // named variables, media / location headers, no footer / buttons
    const named = emptyState({
      parameterFormat: 'named',
      headerKind: 'text',
      headerText: 'For {{month}}',
      headerExample: 'Oct',
      body: 'Hi {{first_name}}, all good.',
      examples: { first_name: 'Asha' },
    });
    expect(toComponents(named)).toEqual([
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'For {{month}}',
        example: { header_text_named_params: [{ param_name: 'month', example: 'Oct' }] },
      },
      {
        type: 'BODY',
        text: 'Hi {{first_name}}, all good.',
        example: { body_text_named_params: [{ param_name: 'first_name', example: 'Asha' }] },
      },
    ]);
    expect(valid({ ...named, name: 'n' })).toEqual([]);
    expect(toComponents(emptyState({ headerKind: 'image', body: 'Offer' }))[0]).toEqual({
      type: 'HEADER',
      format: 'IMAGE',
    });
    expect(toComponents(emptyState({ headerKind: 'location', body: 'Visit' }))[0]).toEqual({
      type: 'HEADER',
      format: 'LOCATION',
    });
    expect(
      toComponents(emptyState({ headerKind: 'text', headerText: 'Plain', body: 'x' }))[0],
    ).toEqual({
      type: 'HEADER',
      format: 'TEXT',
      text: 'Plain',
    });
  });

  it('a call permission template is the body + the call request, no buttons', () => {
    const s = callPermissionState();
    expect(s).toMatchObject({
      name: 'call_permission_en',
      category: 'UTILITY',
      purpose: 'call_permission',
    });
    expect(toComponents({ ...s, buttons: [emptyButton('QUICK_REPLY')] })).toEqual([
      { type: 'BODY', text: s.body },
      { type: 'call_permission_request' },
    ]);
    expect(valid(s)).toEqual([]);
    expect(callPermissionState('hi').name).toBe('call_permission_hi');
  });

  it('round-trips a stored template into the form', () => {
    const form = fromTemplate(fakeTemplate('APPROVED', 'UTILITY', EMI_COMPONENTS));
    expect(form).toMatchObject({
      name: 'emi_reminder',
      headerKind: 'text',
      headerText: 'EMI for {{1}}',
      headerExample: 'Asha',
      examples: { 1: 'Asha', 2: '₹12,500.00' },
      footer: 'Demo Finance',
    });
    expect(form.buttons.map((b) => [b.type, b.text, b.url, b.dynamic, b.example])).toEqual([
      ['QUICK_REPLY', 'Paid already', '', false, ''],
      ['URL', 'Pay now', 'https://pay.example.com/', true, 'LN-1001'],
    ]);
    expect(toComponents(form)).toEqual(EMI_COMPONENTS);
    const other = fromTemplate(
      fakeTemplate(
        'DRAFT',
        'MARKETING',
        [
          { type: 'HEADER', format: 'VIDEO' },
          {
            type: 'BODY',
            text: 'Hi {{name}}',
            example: { body_text_named_params: [{ param_name: 'name', example: 'Asha' }] },
          },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'PHONE_NUMBER', text: 'Call', phone_number: '+91900' },
              { type: 'COPY_CODE', example: 'SAVE' },
              { type: 'URL', text: 'Go', url: 'https://x.example/{{1}}', example: ['Z9'] },
              { type: 'URL', text: 'Site', url: 'https://plain.example' },
            ],
          },
        ],
        { parameterFormat: 'named' },
      ),
    );
    expect(other.headerKind).toBe('video');
    expect(other.examples).toEqual({ name: 'Asha' });
    expect(other.buttons.map((b) => [b.phone, b.example, b.url])).toEqual([
      ['+91900', '', ''],
      ['', 'SAVE', ''],
      ['', 'Z9', 'https://x.example/'],
      ['', '', 'https://plain.example'],
    ]);
    const named = fromTemplate(
      fakeTemplate(
        'DRAFT',
        'UTILITY',
        [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'For {{m}}',
            example: { header_text_named_params: [{ param_name: 'm', example: 'Oct' }] },
          },
          { type: 'BODY', text: 'x' },
        ],
        { parameterFormat: 'named' },
      ),
    );
    expect(named.headerExample).toBe('Oct');
    const none = fromTemplate(
      fakeTemplate('DRAFT', 'UTILITY', [
        { type: 'HEADER', format: 'GIF' },
        { type: 'BODY', text: 'x' },
      ]),
    );
    expect(none.headerKind).toBe('none');
    expect(
      fromTemplate(fakeTemplate('DRAFT', 'UTILITY', [{ type: 'BODY', text: 'x' }])).headerKind,
    ).toBe('none');
  });
});
