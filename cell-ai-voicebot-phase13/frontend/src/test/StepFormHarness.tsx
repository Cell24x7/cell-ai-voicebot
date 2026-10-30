import { useState } from 'react';

import { StepForm } from '@/features/flows/inspector/StepForm';
import type { DraftGraph, DraftNode } from '@/services/api/types';

import { FAKE_FLOW_CATALOG, KNOWN_VARIABLES, draftNode } from './flows';

/** Holds one step's config in state, like the builder does. */
export function Harness({
  type,
  config,
  readOnly,
  errors,
  graph,
  onConfig,
}: {
  type: DraftNode['type'];
  config: Record<string, unknown>;
  readOnly: boolean;
  errors: Record<string, string>;
  graph: DraftGraph;
  onConfig: (c: Record<string, unknown>) => void;
}) {
  const [c, setC] = useState(config);
  return (
    <StepForm
      node={draftNode('n1', type, c)}
      apply={(next) => {
        setC(next);
        onConfig(next);
      }}
      readOnly={readOnly}
      graph={graph}
      fieldErrors={errors}
      catalog={FAKE_FLOW_CATALOG}
      known={KNOWN_VARIABLES}
    />
  );
}
