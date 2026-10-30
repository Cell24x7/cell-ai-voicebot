/** Selling price of one minute: the call (by the customer's market) + the AI. */
export const aiCallMinuteMicros = (
  rates:
    | {
        aiPerMinuteMicros: number;
        whatsappCalling: { markets: { market: string; perMinuteMicros: number }[] };
      }
    | undefined,
  phoneE164: string,
): { call: number; ai: number } | null => {
  if (!rates) return null;
  const markets = rates.whatsappCalling.markets;
  const market =
    (phoneE164.startsWith('+91') ? markets.find((m) => m.market === 'IN') : undefined) ??
    markets.find((m) => m.market === 'OTHER');
  if (!market) return null;
  return { call: market.perMinuteMicros, ai: rates.aiPerMinuteMicros };
};
