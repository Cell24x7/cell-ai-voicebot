import { useCallback, useReducer } from 'react';

import type { DraftGraph } from '@/services/api/types';

import { graphReducer, type GraphAction } from './reducer';

export const HISTORY_LIMIT = 50;

export interface HistoryState {
  past: DraftGraph[];
  present: DraftGraph;
  future: DraftGraph[];
  /** Last coalescing key (e.g. one drag) — same key = one undo step. */
  lastKey: string | null;
}

export type HistoryAction =
  | { type: 'apply'; action: GraphAction; coalesce?: string; skipHistory?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; graph: DraftGraph };

/** Undo / redo around the pure graph reducer (≤ 50 steps). */
export const historyReducer = (state: HistoryState, action: HistoryAction): HistoryState => {
  switch (action.type) {
    case 'apply': {
      const next = graphReducer(state.present, action.action);
      if (next === state.present) return state;
      if (action.skipHistory) return { ...state, present: next };
      if (action.coalesce && action.coalesce === state.lastKey) {
        return { ...state, present: next, future: [] };
      }
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
        lastKey: action.coalesce ?? null,
      };
    }
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        lastKey: null,
      };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return { past: [...state.past, state.present], present: next, future: rest, lastKey: null };
    }
    case 'reset':
      return { past: [], present: action.graph, future: [], lastKey: null };
  }
};

export const useGraphHistory = (initial: DraftGraph) => {
  const [state, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initial,
    future: [],
    lastKey: null,
  });
  const apply = useCallback(
    (action: GraphAction, options: { coalesce?: string; skipHistory?: boolean } = {}) =>
      dispatch({ type: 'apply', action, ...options }),
    [],
  );
  return {
    graph: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    apply,
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
    reset: useCallback((graph: DraftGraph) => dispatch({ type: 'reset', graph }), []),
  };
};
