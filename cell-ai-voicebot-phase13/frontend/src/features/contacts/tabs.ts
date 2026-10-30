export const CONTACT_TABS = ['all', 'lists', 'segments', 'dnd', 'fields'] as const;
export type ContactTab = (typeof CONTACT_TABS)[number];

export const CONTACT_TAB_LABELS: Record<ContactTab, string> = {
  all: 'Contacts',
  lists: 'Lists',
  segments: 'Segments',
  dnd: 'Do-not-call',
  fields: 'Fields',
};

export const isContactTab = (value: string | undefined): value is ContactTab =>
  (CONTACT_TABS as readonly string[]).includes(value ?? '');
