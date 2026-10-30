import { describe, expect, it } from 'vitest';

import type { Segment } from '@/services/api/types';

import { hasFilters, readView, toFilter, toQuery, writeView } from './contacts-view';

describe('contacts view (URL state)', () => {
  it('reads defaults and round-trips every field', () => {
    const empty = readView(new URLSearchParams());
    expect(empty).toEqual({
      q: '',
      listId: '',
      tags: [],
      dnd: '',
      optedOut: '',
      segmentId: '',
      advanced: null,
      sort: { field: 'createdAt', direction: 'desc' },
      page: 1,
      limit: 20,
    });
    expect(writeView(empty).toString()).toBe('');
    expect(hasFilters(empty)).toBe(false);
    const params = new URLSearchParams(
      'q=asha&listId=l1&tag=vip,new&dnd=true&optedOut=false&segmentId=s1&sort=name&page=3&limit=50',
    );
    const view = readView(params);
    expect(view).toMatchObject({
      tags: ['vip', 'new'],
      dnd: 'true',
      sort: { field: 'name', direction: 'asc' },
      page: 3,
      limit: 50,
    });
    expect(writeView(view).toString()).toBe(params.toString());
    expect(hasFilters(view)).toBe(true);
    expect(toQuery(view)).toEqual({
      page: 3,
      limit: 50,
      sort: 'name',
      q: 'asha',
      listId: 'l1',
      tag: 'vip,new',
      dnd: 'true',
      optedOut: 'false',
      segmentId: 's1',
    });
  });

  it('keeps an advanced filter in the URL and uses it as the filter', () => {
    const advanced = { conditions: [{ key: 'dpd', op: 'gt' as const, value: '30' }] };
    const view = readView(writeView({ ...readView(new URLSearchParams()), advanced }));
    expect(view.advanced).toEqual(advanced);
    expect(hasFilters(view)).toBe(true);
    expect(toFilter(view)).toEqual(advanced);
    for (const bad of ['{oops', '[1]', 'null', '7']) {
      expect(readView(new URLSearchParams({ f: bad })).advanced).toBeNull();
    }
  });

  it('ignores bad values', () => {
    expect(readView(new URLSearchParams('sort=-phone&page=-2&limit=7&dnd=maybe'))).toMatchObject({
      sort: { field: 'createdAt', direction: 'desc' },
      page: 1,
      limit: 20,
      dnd: '',
    });
    expect(readView(new URLSearchParams('sort=-updatedAt')).sort).toEqual({
      field: 'updatedAt',
      direction: 'desc',
    });
  });

  it('builds a filter for "all matching", or null when it cannot be exact', () => {
    const view = readView(new URLSearchParams('q=a&listId=l1&tag=vip&dnd=false&optedOut=true'));
    expect(toFilter(view)).toEqual({
      q: 'a',
      listIds: ['l1'],
      tags: { mode: 'any', values: ['vip'] },
      dnd: false,
      optedOut: true,
    });
    const segment = {
      filter: { listIds: ['l2'], conditions: [{ key: 'dpd', op: 'gt', value: 30 }] },
    } as unknown as Segment;
    expect(toFilter(readView(new URLSearchParams('dnd=true')), segment)).toEqual({
      ...segment.filter,
      dnd: true,
    });
    expect(toFilter(readView(new URLSearchParams('listId=l1')), segment)).toBeNull();
    expect(
      toFilter(readView(new URLSearchParams('tag=x')), {
        filter: { tags: { mode: 'all', values: ['y'] } },
      } as unknown as Segment),
    ).toBeNull();
    expect(
      toFilter(readView(new URLSearchParams('q=x')), { filter: { q: 'y' } } as unknown as Segment),
    ).toBeNull();
  });
});
