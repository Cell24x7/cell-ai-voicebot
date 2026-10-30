import type { TableSort } from '@/components/DataTable';
import type { ContactsQuery } from '@/services/api/contacts';
import type { ContactFilter, Segment } from '@/services/api/types';

/** Contacts tab state — lives in the URL so views are shareable and Back works. */
export interface ContactsView {
  q: string;
  listId: string;
  tags: string[];
  dnd: '' | 'true' | 'false';
  optedOut: '' | 'true' | 'false';
  segmentId: string;
  /** Advanced filter (segment builder) — replaces the simple filters while set. */
  advanced: ContactFilter | null;
  sort: TableSort;
  page: number;
  limit: number;
}

export const DEFAULT_SORT: TableSort = { field: 'createdAt', direction: 'desc' };
const LIMITS = [10, 20, 50, 100];
const SORT_FIELDS = ['createdAt', 'updatedAt', 'name'];

const tri = (v: string | null): '' | 'true' | 'false' => (v === 'true' || v === 'false' ? v : '');

const readAdvanced = (raw: string | null): ContactFilter | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const readView = (params: URLSearchParams): ContactsView => {
  const sortRaw = params.get('sort') ?? '';
  const field = sortRaw.replace(/^-/, '');
  const limit = Number(params.get('limit'));
  return {
    q: params.get('q') ?? '',
    listId: params.get('listId') ?? '',
    tags: (params.get('tag') ?? '').split(',').filter(Boolean),
    dnd: tri(params.get('dnd')),
    optedOut: tri(params.get('optedOut')),
    segmentId: params.get('segmentId') ?? '',
    advanced: readAdvanced(params.get('f')),
    sort: SORT_FIELDS.includes(field)
      ? { field, direction: sortRaw.startsWith('-') ? 'desc' : 'asc' }
      : DEFAULT_SORT,
    page: Math.max(1, Number(params.get('page')) || 1),
    limit: LIMITS.includes(limit) ? limit : 20,
  };
};

/** View → URL params (defaults left out). */
export const writeView = (view: ContactsView): URLSearchParams => {
  const p = new URLSearchParams();
  if (view.q) p.set('q', view.q);
  if (view.listId) p.set('listId', view.listId);
  if (view.tags.length) p.set('tag', view.tags.join(','));
  if (view.dnd) p.set('dnd', view.dnd);
  if (view.optedOut) p.set('optedOut', view.optedOut);
  if (view.segmentId) p.set('segmentId', view.segmentId);
  if (view.advanced) p.set('f', JSON.stringify(view.advanced));
  const sort = `${view.sort.direction === 'desc' ? '-' : ''}${view.sort.field}`;
  if (sort !== '-createdAt') p.set('sort', sort);
  if (view.page > 1) p.set('page', String(view.page));
  if (view.limit !== 20) p.set('limit', String(view.limit));
  return p;
};

export const hasFilters = (view: ContactsView): boolean =>
  Boolean(
    view.q ||
    view.listId ||
    view.tags.length ||
    view.dnd ||
    view.optedOut ||
    view.segmentId ||
    view.advanced,
  );

export const toQuery = (view: ContactsView): ContactsQuery => ({
  page: view.page,
  limit: view.limit,
  sort: `${view.sort.direction === 'desc' ? '-' : ''}${view.sort.field}`,
  ...(view.q ? { q: view.q } : {}),
  ...(view.listId ? { listId: view.listId } : {}),
  ...(view.tags.length ? { tag: view.tags.join(',') } : {}),
  ...(view.dnd ? { dnd: view.dnd } : {}),
  ...(view.optedOut ? { optedOut: view.optedOut } : {}),
  ...(view.segmentId ? { segmentId: view.segmentId } : {}),
});

/**
 * The same view as a `ContactFilter` (bulk actions / export of "all matching").
 * `null` when it can't be expressed exactly (a segment that also filters
 * lists / tags combined with a list / tag filter).
 */
export const toFilter = (view: ContactsView, segment?: Segment): ContactFilter | null => {
  if (view.advanced) return view.advanced;
  const base: ContactFilter = segment ? { ...segment.filter } : {};
  if (view.listId) {
    if (base.listIds?.length) return null;
    base.listIds = [view.listId];
  }
  if (view.tags.length) {
    if (base.tags) return null;
    base.tags = { mode: 'any', values: view.tags };
  }
  if (view.dnd) base.dnd = view.dnd === 'true';
  if (view.optedOut) base.optedOut = view.optedOut === 'true';
  if (view.q) {
    if (base.q) return null;
    base.q = view.q;
  }
  return base;
};
