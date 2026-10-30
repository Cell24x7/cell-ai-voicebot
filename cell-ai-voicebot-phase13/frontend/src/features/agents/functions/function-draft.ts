import type { FunctionInput } from '@/services/api/agents';
import type {
  AgentFunction,
  AgentFunctionParam,
  AgentFunctionTestResult,
} from '@/services/api/types';

/** A parameter row while editing (enum values typed as one comma list). */
export interface ParamDraft {
  name: string;
  type: AgentFunctionParam['type'];
  description: string;
  required: boolean;
  enumText: string;
}

/** A header row: `stored` = hint of a saved secret; `value: null` keeps it. */
export interface HeaderDraft {
  name: string;
  secret: boolean;
  value: string | null;
  stored: string | null;
}

export interface FunctionDraft {
  name: string;
  description: string;
  parameters: ParamDraft[];
  method: AgentFunction['method'];
  url: string;
  headers: HeaderDraft[];
  bodyTemplate: string;
  resultPath: string;
  responseHint: string;
  timeoutSec: string;
}

export const emptyDraft = (): FunctionDraft => ({
  name: '',
  description: '',
  parameters: [],
  method: 'GET',
  url: 'https://',
  headers: [],
  bodyTemplate: '',
  resultPath: '',
  responseHint: '',
  timeoutSec: '6',
});

export const toDraft = (fn: AgentFunction): FunctionDraft => ({
  name: fn.name,
  description: fn.description,
  parameters: fn.parameters.map((p) => ({
    name: p.name,
    type: p.type,
    description: p.description,
    required: p.required,
    enumText: (p.enumValues ?? []).join(', '),
  })),
  method: fn.method,
  url: fn.url,
  headers: fn.headers.map((h) => ({
    name: h.name,
    secret: h.secret,
    value: h.secret ? null : (h.value ?? ''),
    stored: h.secret ? (h.valueHint ?? null) : null,
  })),
  bodyTemplate: fn.bodyTemplate ?? '',
  resultPath: fn.resultPath ?? '',
  responseHint: fn.responseHint ?? '',
  timeoutSec: String(fn.timeoutMs / 1000),
});

/** Draft → API body. Secret headers with a stored value and no new one send `null` (keep). */
export const toFunctionInput = (d: FunctionDraft): FunctionInput => ({
  name: d.name.trim(),
  description: d.description.trim(),
  parameters: d.parameters.map((p) => ({
    name: p.name.trim(),
    type: p.type,
    description: p.description.trim(),
    required: p.required,
    ...(p.type === 'enum'
      ? {
          enumValues: p.enumText
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        }
      : {}),
  })),
  method: d.method,
  url: d.url.trim(),
  headers: d.headers.map((h) => ({
    name: h.name.trim(),
    secret: h.secret,
    value: h.secret && h.stored && !h.value ? null : (h.value ?? ''),
  })),
  bodyTemplate: d.method === 'GET' || !d.bodyTemplate.trim() ? null : d.bodyTemplate,
  resultPath: d.resultPath.trim() || null,
  responseHint: d.responseHint.trim() || null,
  timeoutMs: Math.round(Number(d.timeoutSec) * 1000),
});

/** `https://api.example.com:8443/x` → `api.example.com:8443` (placeholders kept). */
export const hostOf = (url: string): string => /^[a-z]+:\/\/([^/?#]+)/i.exec(url)?.[1] ?? url;

/** Plain-language explanation of a tool error code. */
export const toolErrorText = (code: string | null): string | null => {
  if (!code) return null;
  if (code.startsWith('http_')) return `The API answered with HTTP ${code.slice(5)}`;
  return (
    {
      blocked:
        'This address is not allowed (private, local or cloud-metadata address, or a blocked port)',
      timeout: 'The API did not answer in time',
      too_large: 'The answer is larger than 64 KB',
      invalid_json: 'The API said it sent JSON but the body is not valid JSON',
      network: 'The API could not be reached',
      too_many_redirects: 'Too many redirects',
      invalid_request: 'The request could not be built (check the URL and headers)',
      secret_unavailable: 'A secret header could not be read — enter it again',
      invalid_arguments: 'The arguments do not match the parameters',
    }[code] ?? code
  );
};

/** Pretty JSON when the result is JSON, else the text. */
export const prettyResult = (result: AgentFunctionTestResult['result']): string => {
  try {
    return JSON.stringify(JSON.parse(result), null, 2);
  } catch {
    return result;
  }
};

/** Typed args from the test form (numbers, booleans; empty optional values left out). */
export const testArgs = (params: AgentFunctionParam[], values: Record<string, string>) => {
  const args: Record<string, unknown> = {};
  for (const p of params) {
    const raw = values[p.name] ?? '';
    if (raw === '' && !p.required) continue;
    if (p.type === 'number' || p.type === 'integer') args[p.name] = raw === '' ? raw : Number(raw);
    else if (p.type === 'boolean') args[p.name] = raw === 'true';
    else args[p.name] = raw;
  }
  return args;
};
