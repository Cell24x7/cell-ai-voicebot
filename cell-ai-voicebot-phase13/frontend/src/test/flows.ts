import type {
  DraftGraph,
  DraftNode,
  Flow,
  FlowCatalog,
  FlowListItem,
  FlowNodeCatalogEntry,
  FlowRun,
  FlowSettings,
  FlowVariableInfo,
} from '@/services/api/types';

const exit = (handle: string, label: string, required = false) => ({
  handle,
  label,
  required,
  kind: handle === 'error' ? ('error' as const) : ('normal' as const),
});
const ERROR = exit('error', 'Error');
const node = (
  type: FlowNodeCatalogEntry['type'],
  label: string,
  group: FlowNodeCatalogEntry['group'],
  staticExits: FlowNodeCatalogEntry['staticExits'],
  extra: Partial<FlowNodeCatalogEntry> = {},
): FlowNodeCatalogEntry => ({
  type,
  label,
  group,
  description: `${label} node`,
  waits: false,
  staticExits,
  dynamicExits: null,
  defaults: {},
  ...extra,
});

/** A catalogue like `GET /flows/catalog` (Phase 6 UI tests). */
export const FAKE_FLOW_CATALOG: FlowCatalog = {
  nodes: [
    node('start', 'Start', 'start', [exit('next', 'Next', true)], {
      defaults: { triggers: ['test'] },
    }),
    node('speak', 'Speak', 'say_listen', [exit('next', 'Next', true), ERROR], {
      defaults: { text: 'Namaste {{name}}!', language: 'flow', interruptible: true },
    }),
    node('play_audio', 'Play audio', 'say_listen', [exit('next', 'Next', true), ERROR], {
      defaults: { audioId: '' },
    }),
    node(
      'gather_dtmf',
      'Keypad menu',
      'say_listen',
      [exit('no_input', 'No input'), exit('invalid', 'Invalid'), ERROR],
      {
        waits: true,
        dynamicExits: 'keys',
        defaults: {
          prompt: { kind: 'speak', text: 'Press 1' },
          mode: 'menu',
          keys: [{ id: 'k1', key: '1', label: 'Yes' }],
          maxRetries: 2,
          timeoutSec: 7,
          invalidText: 'Invalid',
          noInputText: 'No input',
          repeatKey: null,
          minDigits: 1,
          maxDigits: 4,
          finishKey: '#',
          saveAs: null,
        },
      },
    ),
    node('gather_speech', 'Listen', 'say_listen', [exit('no_input', 'No input'), ERROR], {
      waits: true,
      dynamicExits: 'intents',
      defaults: {
        prompt: { kind: 'speak', text: 'Say' },
        intents: [],
        matchMode: 'keywords',
        maxRetries: 2,
        timeoutSec: 8,
        language: 'flow',
        saveAs: null,
        invalidText: 'x',
        noInputText: 'y',
      },
    }),
    node(
      'ai_agent',
      'AI agent',
      'ai',
      [
        exit('transfer', 'Transfer requested'),
        exit('paid', 'Paid'),
        exit('promise_to_pay', 'Promise to pay'),
        exit('callback', 'Callback'),
        exit('wrong_number', 'Wrong number'),
        exit('resolved', 'Resolved', true),
        exit('no_response', 'No response'),
        ERROR,
      ],
      { waits: true, defaults: { agentId: '' } },
    ),
    node(
      'api_request',
      'API request',
      'logic',
      [exit('success', 'Success', true), exit('failure', 'Failure'), ERROR],
      { defaults: { url: '' } },
    ),
    node('condition_router', 'Condition', 'logic', [exit('else', 'Else', true)], {
      dynamicExits: 'rules',
      defaults: { rules: [] },
    }),
    node('set_variable', 'Set variable', 'logic', [exit('next', 'Next', true), ERROR], {
      defaults: { assignments: [] },
    }),
    node('set_disposition', 'Set disposition', 'actions', [exit('next', 'Next', true)], {
      defaults: { disposition: 'other', note: null },
    }),
    node(
      'transfer_to_agent',
      'Transfer',
      'actions',
      [exit('failed', 'Failed'), exit('no_answer', 'No answer'), ERROR],
      { waits: true, defaults: { phone: '' } },
    ),
    node('send_sms', 'Send SMS', 'actions', [exit('next', 'Next', true)], {
      defaults: { text: '' },
    }),
    node('send_whatsapp', 'Send WhatsApp', 'actions', [exit('next', 'Next', true)], {
      defaults: { templateName: '' },
    }),
    node('wait', 'Wait', 'actions', [exit('next', 'Next', true)], {
      waits: true,
      defaults: { seconds: 5 },
    }),
    node('hangup', 'Hang up', 'end', [], { defaults: { text: 'Bye' } }),
  ],
  groups: ['start', 'say_listen', 'ai', 'logic', 'actions', 'end'],
  operators: [
    { operator: 'equals', needsValue: true },
    { operator: 'gt', needsValue: true },
    { operator: 'is_empty', needsValue: false },
  ],
  dispositions: ['paid', 'promise_to_pay', 'callback_requested', 'wrong_number', 'other'],
  languages: ['hi', 'en', 'hinglish'],
  speechLanguages: ['flow', 'hi', 'en', 'hinglish', 'auto'],
  voices: ['coral', 'alloy'],
  triggers: ['campaign', 'inbound', 'api', 'test'],
  variableTypes: ['text', 'number', 'boolean', 'date'],
  httpMethods: ['GET', 'POST', 'PUT', 'PATCH'],
  systemVariables: [{ name: 'promise_date', label: 'Promise date', type: 'date' }],
  limits: { nodesMax: 150, speakTextMaxChars: 1000, smsSinglePartChars: 160 },
};

export const catalogMap = () => new Map(FAKE_FLOW_CATALOG.nodes.map((n) => [n.type, n]));

export const SETTINGS: FlowSettings = {
  language: 'hinglish',
  voice: 'coral',
  errorMessage: 'Maaf kijiye.',
  onError: 'hangup',
  errorTransferPhone: null,
  maxDurationSec: 900,
};

export const draftNode = (
  id: string,
  type: DraftNode['type'],
  config: Record<string, unknown> = {},
  extra: Partial<DraftNode> = {},
): DraftNode => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config,
  ...extra,
});

/** start → greet → menu(1 → bye) */
export const sampleGraph = (): DraftGraph => ({
  schemaVersion: 1,
  nodes: [
    draftNode('start', 'start', {}),
    draftNode(
      'greet',
      'speak',
      { text: 'Namaste {{name}}' },
      { label: 'Greeting', position: { x: 0, y: 120 } },
    ),
    draftNode(
      'menu',
      'gather_dtmf',
      { prompt: { kind: 'speak', text: 'Press 1' }, keys: [{ id: 'k1', key: '1', label: 'Yes' }] },
      { label: 'Main menu', position: { x: 0, y: 240 } },
    ),
    draftNode('bye', 'hangup', { text: 'Bye' }, { position: { x: 0, y: 360 } }),
  ],
  edges: [
    { id: 'e1', source: 'start', sourceHandle: 'next', target: 'greet' },
    { id: 'e2', source: 'greet', sourceHandle: 'next', target: 'menu' },
    { id: 'e3', source: 'menu', sourceHandle: 'key_k1', target: 'bye' },
  ],
  variables: [{ name: 'status', type: 'text' }],
  settings: SETTINGS,
});

export const fakeFlowRow = (overrides: Partial<FlowListItem> = {}): FlowListItem => ({
  id: 'f1',
  name: 'Loan recovery',
  description: 'EMI follow-up',
  status: 'published',
  revision: 3,
  publishedVersion: 2,
  hasUnpublishedChanges: true,
  nodesCount: 4,
  triggers: ['campaign', 'test'],
  agents: [{ id: 'a1', name: 'Recovery Bot' }],
  templateKey: 'loan_recovery',
  updatedBy: { id: 'u1', name: 'Asha Verma' },
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
  ...overrides,
});

export const fakeFlow = (overrides: Partial<Flow> = {}): Flow => ({
  ...fakeFlowRow(),
  draft: sampleGraph() as unknown as Flow['draft'],
  issues: [],
  ...overrides,
});

export const fakeRun = (overrides: Partial<FlowRun> = {}): FlowRun => ({
  id: 'r1',
  flowId: 'f1',
  versionRef: 'draft',
  status: 'waiting',
  waiting: {
    kind: 'dtmf',
    nodeId: 'menu',
    timeoutSec: 7,
    mode: 'menu',
    keys: [{ key: '1', label: 'Yes' }],
  },
  currentNodeId: 'menu',
  variables: { name: 'Asha', promise_date: '' },
  outcome: {
    disposition: null,
    dispositionNote: null,
    promiseToPay: null,
    callback: null,
    transfer: null,
    messages: [],
  },
  costMicros: 0,
  endReason: null,
  contactName: 'Asha',
  createdBy: { id: 'u1', name: 'Asha Verma' },
  createdAt: '2026-10-11T00:00:00.000Z',
  endedAt: null,
  ...overrides,
});

/** Contact + system variables like `GET /flows/:id/variables`. */
export const KNOWN_VARIABLES: FlowVariableInfo[] = [
  { name: 'name', label: 'Name', type: 'built_in', source: 'contact', readOnly: true },
  { name: 'amount', label: 'Amount', type: 'currency', source: 'contact', readOnly: true },
  { name: 'promise_date', label: 'Promise date', type: 'date', source: 'system', readOnly: true },
  { name: 'status', label: 'status', type: 'text', source: 'flow', readOnly: false },
];
