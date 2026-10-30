import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import type { DraftGraph, DraftNode } from '@/services/api/types';

import { sampleGraph } from './flows';
import { renderWithProviders } from './render';
import { Harness } from './StepFormHarness';

/** Renders one step form; returns a spy with every applied config. */
export function renderStepForm(
  type: DraftNode['type'],
  config: Record<string, unknown> = {},
  {
    readOnly = false,
    errors = {},
    graph = sampleGraph(),
  }: { readOnly?: boolean; errors?: Record<string, string>; graph?: DraftGraph } = {},
) {
  const onConfig = vi.fn<(c: Record<string, unknown>) => void>();
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <Harness
            type={type}
            config={config}
            readOnly={readOnly}
            errors={errors}
            graph={graph}
            onConfig={onConfig}
          />
        ),
      },
    ],
  });
  return {
    onConfig,
    last: () => onConfig.mock.lastCall?.[0] ?? {},
  };
}

/** Picks an option of a MUI (non-native) select by its label. */
export async function pick(label: string | RegExp, option: string | RegExp, index = 0) {
  const boxes = screen.getAllByRole('combobox', { name: label });
  await userEvent.click(boxes[index] as HTMLElement);
  await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }));
}
