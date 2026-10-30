import type {
  DraftGraph,
  DraftNode,
  FlowEdge,
  FlowSettings,
  FlowVariable,
} from '@/services/api/types';

export type GraphAction =
  | { type: 'add_node'; node: DraftNode }
  | { type: 'move_nodes'; moves: { id: string; position: { x: number; y: number } }[] }
  | { type: 'delete'; nodeIds: string[]; edgeIds: string[] }
  | { type: 'connect'; edge: FlowEdge }
  | { type: 'update_config'; id: string; config: Record<string, unknown>; handles: string[] }
  | { type: 'update_label'; id: string; label: string }
  | { type: 'paste'; nodes: DraftNode[]; edges: FlowEdge[] }
  | { type: 'replace'; graph: DraftGraph }
  | { type: 'set_variables'; variables: FlowVariable[]; renames?: { from: string; to: string }[] }
  | { type: 'set_settings'; settings: FlowSettings }
  | { type: 'layout'; positions: Record<string, { x: number; y: number }> };

/** Renames `{{from}}` tokens and exact variable-name fields everywhere in a value. */
const renameIn = (value: unknown, from: string, to: string, key = ''): unknown => {
  if (typeof value === 'string') {
    if (['variable', 'saveAs'].includes(key) && value === from) return to;
    return value.replace(new RegExp(`\\{\\{\\s*${from}\\s*\\}\\}`, 'g'), `{{${to}}}`);
  }
  if (Array.isArray(value)) {
    return value.map((v) => (key === 'passVariables' && v === from ? to : renameIn(v, from, to)));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renameIn(v, from, to, k)]));
  }
  return value;
};

/** Pure graph edits (the builder keeps history around it). */
export const graphReducer = (graph: DraftGraph, action: GraphAction): DraftGraph => {
  switch (action.type) {
    case 'add_node':
      return { ...graph, nodes: [...graph.nodes, action.node] };
    case 'move_nodes': {
      const moves = new Map(action.moves.map((m) => [m.id, m.position]));
      return {
        ...graph,
        nodes: graph.nodes.map((n) =>
          moves.has(n.id) ? { ...n, position: moves.get(n.id) ?? n.position } : n,
        ),
      };
    }
    case 'delete': {
      const nodes = new Set(action.nodeIds);
      const edges = new Set(action.edgeIds);
      return {
        ...graph,
        nodes: graph.nodes.filter((n) => !nodes.has(n.id)),
        edges: graph.edges.filter(
          (e) => !edges.has(e.id) && !nodes.has(e.source) && !nodes.has(e.target),
        ),
      };
    }
    case 'connect': {
      const e = action.edge;
      const taken = graph.edges.some(
        (x) => x.source === e.source && x.sourceHandle === e.sourceHandle,
      );
      if (taken) return graph;
      return { ...graph, edges: [...graph.edges, e] };
    }
    case 'update_config': {
      const handles = new Set(action.handles);
      return {
        ...graph,
        nodes: graph.nodes.map((n) => (n.id === action.id ? { ...n, config: action.config } : n)),
        // exits that no longer exist (deleted keys / intents / rules) lose their edges
        edges: graph.edges.filter((e) => e.source !== action.id || handles.has(e.sourceHandle)),
      };
    }
    case 'update_label':
      return {
        ...graph,
        nodes: graph.nodes.map((n) => {
          if (n.id !== action.id) return n;
          // kept as typed (spaces while typing); the server trims on save
          if (action.label.trim()) return { ...n, label: action.label };
          const { label: _drop, ...rest } = n;
          return rest;
        }),
      };
    case 'paste':
      return {
        ...graph,
        nodes: [...graph.nodes, ...action.nodes],
        edges: [...graph.edges, ...action.edges],
      };
    case 'replace':
      return action.graph;
    case 'set_variables': {
      let next: DraftGraph = { ...graph, variables: action.variables };
      for (const { from, to } of action.renames ?? []) {
        if (from === to) continue;
        next = {
          ...next,
          nodes: next.nodes.map((n) => ({
            ...n,
            config: renameIn(n.config, from, to) as Record<string, unknown>,
          })),
          settings: {
            ...next.settings,
            errorMessage: renameIn(next.settings.errorMessage, from, to) as string,
          },
        };
      }
      return next;
    }
    case 'set_settings':
      return { ...graph, settings: action.settings };
    case 'layout':
      return {
        ...graph,
        nodes: graph.nodes.map((n) => ({ ...n, position: action.positions[n.id] ?? n.position })),
      };
  }
};
