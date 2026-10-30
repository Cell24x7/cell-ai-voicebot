import axios from 'axios';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { z } from 'zod';

/**
 * Every failed request becomes an `ApiError` (response interceptor in client.ts).
 * Server codes: docs/conventions/error-codes.md. Client-only codes (no valid
 * envelope) are listed in that doc's "Client-only codes" section.
 */
export const CLIENT_ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  REQUEST_CANCELED: 'REQUEST_CANCELED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

/** `http` = the server answered with an error envelope. */
export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'canceled' | 'unknown';

export interface ApiErrorDetail {
  path: string;
  message: string;
  /** On `CONFLICT_DUPLICATE`: id of the record that already exists. */
  existingId?: string;
  /** On `RESOURCE_IN_USE`: id of the item that uses it (e.g. a flow). */
  id?: string;
  /** On `FLOW_INVALID`: issue code, severity and the node / edge. */
  issue?: string;
  severity?: 'error' | 'warning';
  nodeId?: string;
  edgeId?: string;
  /** On `META_API_ERROR`: Meta's error code / subcode / trace id. */
  metaCode?: number;
  metaSubcode?: number;
  fbtraceId?: string;
}

interface ApiErrorInit {
  status: number;
  code: string;
  message: string;
  kind: ApiErrorKind;
  details?: ApiErrorDetail[];
  requestId?: string;
  retryAfterSec?: number;
  cause?: unknown;
}

export class ApiError extends Error {
  override readonly name = 'ApiError';
  /** HTTP status; `0` when no response arrived. */
  readonly status: number;
  readonly code: string;
  readonly kind: ApiErrorKind;
  readonly details: ApiErrorDetail[];
  /** Server request id — show it to users as a support reference. */
  readonly requestId?: string;
  /** From `Retry-After` on 429 responses. */
  readonly retryAfterSec?: number;

  constructor(init: ApiErrorInit) {
    super(init.message, { cause: init.cause });
    this.status = init.status;
    this.code = init.code;
    this.kind = init.kind;
    this.details = init.details ?? [];
    this.requestId = init.requestId;
    this.retryAfterSec = init.retryAfterSec;
  }
}

const ErrorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    message: z.string(),
    details: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
          existingId: z.string().optional(),
          id: z.string().optional(),
          issue: z.string().optional(),
          severity: z.enum(['error', 'warning']).optional(),
          nodeId: z.string().optional(),
          edgeId: z.string().optional(),
          metaCode: z.number().optional(),
          metaSubcode: z.number().optional(),
          fbtraceId: z.string().optional(),
        }),
      )
      .optional(),
    requestId: z.string().optional(),
  }),
});

const MESSAGES: Record<Exclude<ApiErrorKind, 'http'>, string> = {
  network: "Can't reach the server. Check your connection.",
  timeout: 'The server took too long to respond.',
  canceled: 'Request was canceled.',
  unknown: 'Something went wrong. Please try again.',
};

const header = (headers: unknown, name: string): string | undefined => {
  if (!headers || typeof headers !== 'object') return undefined;
  const h = headers as { get?: (n: string) => unknown } & Record<string, unknown>;
  const value = typeof h.get === 'function' ? h.get(name) : h[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
};

const parseRetryAfter = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
};

/** Normalises anything thrown by axios (or app code) into an `ApiError`. */
export const toApiError = (err: unknown): ApiError => {
  if (err instanceof ApiError) return err;

  if (axios.isCancel(err) || (axios.isAxiosError(err) && err.code === 'ERR_CANCELED')) {
    return new ApiError({
      status: 0,
      code: CLIENT_ERROR_CODES.REQUEST_CANCELED,
      kind: 'canceled',
      message: MESSAGES.canceled,
      cause: err,
    });
  }

  if (!axios.isAxiosError(err)) {
    return new ApiError({
      status: 0,
      code: CLIENT_ERROR_CODES.UNKNOWN_ERROR,
      kind: 'unknown',
      message: MESSAGES.unknown,
      cause: err,
    });
  }

  const { response } = err;
  if (!response) {
    const timedOut = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
    return new ApiError({
      status: 0,
      code: timedOut ? CLIENT_ERROR_CODES.TIMEOUT : CLIENT_ERROR_CODES.NETWORK_ERROR,
      kind: timedOut ? 'timeout' : 'network',
      message: timedOut ? MESSAGES.timeout : MESSAGES.network,
      cause: err,
    });
  }

  const requestIdHeader = header(response.headers, 'x-request-id');
  const retryAfterSec =
    response.status === 429 ? parseRetryAfter(header(response.headers, 'retry-after')) : undefined;
  const envelope = ErrorEnvelopeSchema.safeParse(response.data);
  if (envelope.success) {
    const { code, message, details, requestId } = envelope.data.error;
    return new ApiError({
      status: response.status,
      code,
      kind: 'http',
      message,
      details,
      requestId: requestId ?? requestIdHeader,
      retryAfterSec,
      cause: err,
    });
  }

  return new ApiError({
    status: response.status,
    code: CLIENT_ERROR_CODES.UNKNOWN_ERROR,
    kind: 'unknown',
    message: MESSAGES.unknown,
    requestId: requestIdHeader,
    retryAfterSec,
    cause: err,
  });
};

export const isApiError = (err: unknown): err is ApiError => err instanceof ApiError;

/** User-facing text for any error. */
export const getErrorMessage = (err: unknown): string => {
  const e = toApiError(err);
  return e.kind === 'http' ? e.message : MESSAGES[e.kind];
};

/** Errors the screen can't explain (server bug, network…) — these get a global toast. */
export const isUnexpectedError = (err: unknown): boolean => {
  const e = toApiError(err);
  if (e.kind === 'canceled') return false;
  return e.kind !== 'http' || e.status >= 500;
};

/**
 * Puts server validation `details` on react-hook-form fields.
 * Returns true when at least one field error was applied.
 */
export const applyFieldErrors = <T extends FieldValues>(
  setError: UseFormSetError<T>,
  err: unknown,
): boolean => {
  const { details } = toApiError(err);
  for (const { path, message } of details) {
    // Server paths are prefixed with the request part (`body.email`) — forms use `email`.
    setError(path.replace(/^(body|query|params)\./, '') as Path<T>, { type: 'server', message });
  }
  return details.length > 0;
};
