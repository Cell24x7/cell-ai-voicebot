import { describe, expect, it } from 'vitest';

import { ApiError } from '@/services/api/errors';

import { metaErrorText } from './meta-error';

describe('metaErrorText', () => {
  it('shows Meta operation, code, subcode and message', () => {
    expect(
      metaErrorText({
        metaCode: 131009,
        metaSubcode: 42,
        op: 'calls.connect',
        message: 'Unsupported audio',
      }),
    ).toBe(
      'Meta 131009/42 (calls.connect): Unsupported audio: Call audio ka format Meta ne mana kiya — support ko bhejein.',
    );
  });

  it('adds access and calling restriction hints', () => {
    expect(metaErrorText({ metaCode: 190, message: 'Token expired' })).toContain(
      'Calls via Meta direct',
    );
    expect(metaErrorText({ metaCode: 138006, message: 'Restricted' })).toContain(
      'calling rok rakhi hai',
    );
  });

  it('prefers the structured Meta message over the generic API envelope', () => {
    const error = new ApiError({
      status: 502,
      code: 'META_API_ERROR',
      kind: 'http',
      message: 'Meta returned an error.',
      details: [{ path: 'meta', message: 'Token expired', metaCode: 190, op: 'calls.connect' }],
    });
    expect(metaErrorText(error)).toContain('Meta 190 (calls.connect): Token expired');
  });
});
