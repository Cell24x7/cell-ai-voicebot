import { vi } from 'vitest';

/**
 * `matchMedia` that answers min- / max-width queries for a viewport `width`
 * pixels wide (MUI `useMediaQuery`). Undo with `vi.unstubAllGlobals()`.
 */
export const mockViewport = (width: number): void => {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
  });
};
