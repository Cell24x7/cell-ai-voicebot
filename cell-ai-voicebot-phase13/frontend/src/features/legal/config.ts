/**
 * Company details for the public legal pages (Phase 13). They are **public** build-time
 * values (`VITE_LEGAL_*`), so staging and production can differ without code changes.
 * A missing value shows as `[name]` and marks the page as a draft.
 */
export interface LegalValues {
  company: string;
  address: string;
  email: string;
  grievanceOfficer: string;
  website: string;
  appName: string;
}

type LegalEnv = Partial<
  Record<
    | 'VITE_LEGAL_COMPANY'
    | 'VITE_LEGAL_ADDRESS'
    | 'VITE_LEGAL_EMAIL'
    | 'VITE_LEGAL_GRIEVANCE_OFFICER'
    | 'VITE_LEGAL_WEBSITE'
    | 'VITE_APP_NAME',
    string | undefined
  >
>;

const value = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

export const legalValues = (
  env: LegalEnv = import.meta.env,
): { values: LegalValues; missing: (keyof LegalValues)[] } => {
  const given: Record<keyof LegalValues, string | undefined> = {
    company: value(env.VITE_LEGAL_COMPANY),
    address: value(env.VITE_LEGAL_ADDRESS),
    email: value(env.VITE_LEGAL_EMAIL),
    grievanceOfficer: value(env.VITE_LEGAL_GRIEVANCE_OFFICER),
    website: value(env.VITE_LEGAL_WEBSITE),
    appName: value(env.VITE_APP_NAME) ?? 'Cell AI Voicebot',
  };
  const missing = (Object.keys(given) as (keyof LegalValues)[]).filter((k) => !given[k]);
  const values = Object.fromEntries(
    (Object.keys(given) as (keyof LegalValues)[]).map((k) => [k, given[k] ?? `[${k}]`]),
  ) as unknown as LegalValues;
  return { values, missing };
};
