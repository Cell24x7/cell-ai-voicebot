import type { PickerVariable } from '@/components/fields/VariablePicker';
import type { DraftGraph, DraftNode, FlowVariableInfo } from '@/services/api/types';

/** Only API requests may send these to the customer's own server. */
const SERVER_ONLY: PickerVariable[] = [
  { name: 'contact.phone', label: 'Contact phone', hint: 'API requests only' },
  { name: 'contact.external_id', label: 'Contact external id', hint: 'API requests only' },
];

/** Picker variables: contact + system from the server, flow variables from the live graph. */
export const pickerVariables = (
  known: FlowVariableInfo[] | undefined,
  graph: DraftGraph,
  nodeType?: DraftNode['type'],
): PickerVariable[] => [
  ...(known ?? [])
    .filter((v) => v.source !== 'flow')
    .map((v) => ({ name: v.name, label: v.label })),
  ...graph.variables.map((v) => ({ name: v.name, label: v.label ?? v.name })),
  ...(nodeType === 'api_request' ? SERVER_ONLY : []),
];
