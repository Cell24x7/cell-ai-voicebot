import { z } from 'zod';

/** Client mirror of the server rules for instant feedback — the server stays the authority. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const emailField = z.string().trim().min(1, 'Enter your email').email('Enter a valid email');
export const passwordField = z
  .string()
  .min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `At most ${PASSWORD_MAX} characters`);

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  businessName: z.string().trim().min(2, 'At least 2 characters').max(80),
  name: z.string().trim().min(1, 'Enter your name').max(80),
  email: emailField,
  password: passwordField,
  phone: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^\+[1-9]\d{6,14}$/.test(v),
      'Use the international format, e.g. +919876543210',
    ),
  timezone: z.string().min(1),
});
export type SignupValues = z.infer<typeof signupSchema>;

const passwordsMatch = { message: 'Passwords do not match', path: ['confirm'] };

export const resetSchema = z
  .object({ password: passwordField, confirm: z.string() })
  .refine((v) => v.password === v.confirm, passwordsMatch);
export type ResetValues = z.infer<typeof resetSchema>;

export const acceptInviteSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name').max(80),
    password: passwordField,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, passwordsMatch);
export type AcceptInviteValues = z.infer<typeof acceptInviteSchema>;

export const forgotSchema = z.object({ email: emailField });
export type ForgotValues = z.infer<typeof forgotSchema>;

/** `next` from the query string, only same-app paths. */
export const safeNext = (search: string): string => {
  const next = new URLSearchParams(search).get('next');
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/';
};

/** "Try again in 3 minutes" from a Retry-After value. */
export const retryText = (seconds?: number): string => {
  if (!seconds) return 'Please try again later.';
  return seconds < 90
    ? `Try again in ${Math.ceil(seconds)} seconds.`
    : `Try again in ${Math.ceil(seconds / 60)} minutes.`;
};
