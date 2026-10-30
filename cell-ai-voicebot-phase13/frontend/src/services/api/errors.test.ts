import { AxiosError, AxiosHeaders, CanceledError, type AxiosResponse } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  applyFieldErrors,
  CLIENT_ERROR_CODES,
  getErrorMessage,
  isApiError,
  isUnexpectedError,
  toApiError,
} from './errors';

const response = (
  status: number,
  data: unknown,
  headers: Record<string, string> = {},
): AxiosResponse =>
  ({
    status,
    statusText: '',
    data,
    headers: new AxiosHeaders(headers),
    config: { headers: new AxiosHeaders() },
  }) as AxiosResponse;

const httpError = (status: number, data: unknown, headers?: Record<string, string>) =>
  new AxiosError(
    'Request failed',
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    response(status, data, headers),
  );

const envelope = (code: string, message: string, extra: Record<string, unknown> = {}) => ({
  success: false,
  error: { code, message, requestId: 'req_12345678abcd', ...extra },
});

describe('toApiError', () => {
  it('maps an error envelope (status, code, message, details, requestId)', () => {
    const e = toApiError(
      httpError(
        422,
        envelope('VALIDATION_FAILED', 'Some fields are invalid.', {
          details: [{ path: 'phone', message: 'Invalid phone' }],
        }),
      ),
    );
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'VALIDATION_FAILED',
      kind: 'http',
      message: 'Some fields are invalid.',
      details: [{ path: 'phone', message: 'Invalid phone' }],
      requestId: 'req_12345678abcd',
    });
  });

  it('falls back to the X-Request-Id header and parses Retry-After on 429', () => {
    const e = toApiError(
      httpError(
        429,
        { success: false, error: { code: 'RATE_LIMITED', message: 'Slow down.' } },
        { 'x-request-id': 'req_from_header', 'retry-after': '42' },
      ),
    );
    expect(e.requestId).toBe('req_from_header');
    expect(e.retryAfterSec).toBe(42);
  });

  it('ignores Retry-After outside 429 and invalid values', () => {
    expect(
      toApiError(httpError(503, envelope('PROVIDER_UNAVAILABLE', 'x'), { 'retry-after': '5' }))
        .retryAfterSec,
    ).toBeUndefined();
    expect(
      toApiError(httpError(429, envelope('RATE_LIMITED', 'x'), { 'retry-after': 'soon' }))
        .retryAfterSec,
    ).toBeUndefined();
  });

  it('maps a response without an envelope (proxy 502 HTML) to UNKNOWN_ERROR', () => {
    const e = toApiError(httpError(502, '<html>Bad Gateway</html>', { 'x-request-id': 'req_x' }));
    expect(e).toMatchObject({
      status: 502,
      code: CLIENT_ERROR_CODES.UNKNOWN_ERROR,
      kind: 'unknown',
      requestId: 'req_x',
    });
  });

  it('maps no response to NETWORK_ERROR', () => {
    const e = toApiError(new AxiosError('Network Error', 'ERR_NETWORK'));
    expect(e).toMatchObject({ status: 0, code: 'NETWORK_ERROR', kind: 'network' });
  });

  it.each(['ECONNABORTED', 'ETIMEDOUT'])('maps %s to TIMEOUT', (code) => {
    expect(toApiError(new AxiosError('timeout', code))).toMatchObject({
      code: 'TIMEOUT',
      kind: 'timeout',
      status: 0,
    });
  });

  it('maps cancellations to REQUEST_CANCELED', () => {
    expect(toApiError(new CanceledError())).toMatchObject({
      code: 'REQUEST_CANCELED',
      kind: 'canceled',
    });
    expect(toApiError(new AxiosError('canceled', 'ERR_CANCELED')).kind).toBe('canceled');
  });

  it('maps non-axios errors to UNKNOWN_ERROR and keeps the cause', () => {
    const cause = new TypeError('x is undefined');
    const e = toApiError(cause);
    expect(e).toMatchObject({ code: 'UNKNOWN_ERROR', kind: 'unknown', status: 0 });
    expect(e.cause).toBe(cause);
  });

  it('returns an ApiError unchanged', () => {
    const original = new ApiError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'nope',
      kind: 'http',
    });
    expect(toApiError(original)).toBe(original);
    expect(isApiError(original)).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
  });
});

describe('getErrorMessage / isUnexpectedError', () => {
  it('uses the server message for http errors and friendly text otherwise', () => {
    expect(
      getErrorMessage(httpError(404, envelope('RESOURCE_NOT_FOUND', 'Contact not found.'))),
    ).toBe('Contact not found.');
    expect(getErrorMessage(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(
      "Can't reach the server. Check your connection.",
    );
    expect(getErrorMessage(new AxiosError('t', 'ECONNABORTED'))).toBe(
      'The server took too long to respond.',
    );
    expect(getErrorMessage(new CanceledError())).toBe('Request was canceled.');
    expect(getErrorMessage('boom')).toBe('Something went wrong. Please try again.');
  });

  it('flags 5xx, network, timeout and unknown — not 4xx or canceled', () => {
    expect(isUnexpectedError(httpError(500, envelope('INTERNAL_ERROR', 'x')))).toBe(true);
    expect(isUnexpectedError(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(true);
    expect(isUnexpectedError(new AxiosError('t', 'ETIMEDOUT'))).toBe(true);
    expect(isUnexpectedError(httpError(502, 'html'))).toBe(true);
    expect(isUnexpectedError(httpError(422, envelope('VALIDATION_FAILED', 'x')))).toBe(false);
    expect(isUnexpectedError(httpError(404, envelope('RESOURCE_NOT_FOUND', 'x')))).toBe(false);
    expect(isUnexpectedError(new CanceledError())).toBe(false);
  });
});

describe('applyFieldErrors', () => {
  it('puts server details on form fields', () => {
    const setError = vi.fn();
    const applied = applyFieldErrors(
      setError,
      httpError(
        422,
        envelope('VALIDATION_FAILED', 'Invalid', {
          details: [
            { path: 'phone', message: 'Invalid phone' },
            { path: 'name', message: 'Required' },
          ],
        }),
      ),
    );
    expect(applied).toBe(true);
    expect(setError).toHaveBeenCalledWith('phone', { type: 'server', message: 'Invalid phone' });
    expect(setError).toHaveBeenCalledWith('name', { type: 'server', message: 'Required' });
  });

  it('strips the body. / query. / params. prefix of server paths', () => {
    const setError = vi.fn();
    applyFieldErrors(
      setError,
      httpError(
        422,
        envelope('VALIDATION_FAILED', 'Invalid', {
          details: [
            { path: 'body.password', message: 'Too short' },
            { path: 'query.page', message: 'Bad' },
          ],
        }),
      ),
    );
    expect(setError).toHaveBeenCalledWith('password', { type: 'server', message: 'Too short' });
    expect(setError).toHaveBeenCalledWith('page', { type: 'server', message: 'Bad' });
  });

  it('returns false when there are no details', () => {
    const setError = vi.fn();
    expect(applyFieldErrors(setError, httpError(409, envelope('CONFLICT_DUPLICATE', 'x')))).toBe(
      false,
    );
    expect(setError).not.toHaveBeenCalled();
  });
});
