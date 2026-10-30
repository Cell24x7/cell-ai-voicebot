/** Ticket from a pasted `ws://…/ws/events?ticket=…` URL (from `npm run ws:dev-ticket`). */
export const ticketFromUrl = (value: string): string | null => {
  try {
    return new URL(value.trim()).searchParams.get('ticket');
  } catch {
    return null;
  }
};
