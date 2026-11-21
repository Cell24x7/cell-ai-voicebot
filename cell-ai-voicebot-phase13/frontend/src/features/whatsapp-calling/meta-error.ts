import type { ApiError, ApiErrorDetail } from '@/services/api/errors';

type MetaErrorShape = Partial<Pick<ApiErrorDetail, 'metaCode' | 'metaSubcode' | 'fbtraceId'>> & {
  op?: string;
  message?: string;
};

const knownHint = (code: number | undefined): string | undefined => {
  if (code === 131009 || code === 100)
    return 'Call audio ka format Meta ne mana kiya — support ko bhejein.';
  if (code === 190 || code === 200 || code === 10)
    return 'Meta access band — Calls via Meta direct → Check / Fix.';
  if (code !== undefined && code >= 138000 && code <= 138999)
    return 'WhatsApp ne is number par calling rok rakhi hai.';
  return undefined;
};

export const metaErrorText = (
  error: MetaErrorShape | ApiError | null | undefined,
): string | null => {
  if (!error) return null;
  const shape = error as MetaErrorShape;
  const detail =
    'details' in error ? error.details.find((item) => item.metaCode !== undefined) : undefined;
  const code = shape.metaCode ?? detail?.metaCode;
  const subcode = shape.metaSubcode ?? detail?.metaSubcode;
  const op = shape.op ?? detail?.op;
  const message = detail?.message || shape.message;
  const title =
    code === undefined
      ? 'Meta error'
      : `Meta ${code}${subcode === undefined ? '' : `/${subcode}`}${op ? ` (${op})` : ''}`;
  const hint =
    knownHint(code) ??
    (message && /messaging limit|not eligible|calling is unavailable/i.test(message)
      ? 'Is number ki messaging limit kam ho sakti hai — Meta calling ke liye 2,000/din chahta hai.'
      : undefined);
  return [title, message, hint].filter(Boolean).join(': ');
};
