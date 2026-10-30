import { expect } from '@playwright/test';

import { MAILPIT_URL } from './env';

interface MailSummary {
  ID: string;
  Subject: string;
}

/** Waits for the newest email to `to` whose subject matches, and returns its plain text. */
export async function waitForEmail(to: string, subject: RegExp): Promise<string> {
  let id = '';
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        );
        const body = (await res.json()) as { messages: MailSummary[] };
        id = body.messages.find((m) => subject.test(m.Subject))?.ID ?? '';
        return id;
      },
      { message: `email "${String(subject)}" to ${to}`, timeout: 20_000 },
    )
    .not.toBe('');
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`);
  return ((await res.json()) as { Text: string }).Text;
}

/** First 6-digit code in the text. */
export const extractCode = (text: string): string => {
  const code = /\b(\d{6})\b/.exec(text)?.[1];
  if (!code) throw new Error('No 6-digit code in the email');
  return code;
};

/** First link to the frontend path (e.g. "/reset-password"). */
export const extractLink = (text: string, path: string): string => {
  const link = new RegExp(`https?://[^\\s"<>]+${path}\\?token=[^\\s"<>)]+`).exec(text)?.[0];
  if (!link) throw new Error(`No ${path} link in the email`);
  return link;
};
