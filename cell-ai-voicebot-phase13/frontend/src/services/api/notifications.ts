import { apiClient, unwrap } from './client';
import type { CursorPageMeta, ListEnvelope, Notification, SuccessEnvelope } from './types';

/** `/api/v1/notifications` — the signed-in user's bell. */
export const notificationsApi = {
  list: async (query: { limit?: number; cursor?: string; unread?: boolean }) =>
    (
      await apiClient.get<ListEnvelope<Notification, CursorPageMeta>>('/notifications', {
        params: {
          ...query,
          ...(query.unread === undefined ? {} : { unread: String(query.unread) }),
        },
      })
    ).data,
  unreadCount: async () =>
    (await unwrap(apiClient.get<SuccessEnvelope<{ count: number }>>('/notifications/unread-count')))
      .count,
  markRead: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<Notification>>(`/notifications/${id}/read`)),
  markAllRead: () =>
    unwrap(apiClient.post<SuccessEnvelope<{ updated: number }>>('/notifications/read-all')),
};
