import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { catalogMap, draftNode, sampleGraph } from '@/test/flows';

import { nodeExits } from './exits';
import { HISTORY_LIMIT, useGraphHistory } from './history';
import { newId } from './ids';
import { layoutGraph, NODE_HEIGHT } from './layout';
import { localIssues } from './local-issues';
import { freeSpot, PLACE_STEP_X, visibleCentre } from './place';
import { graphReducer } from './reducer';

const catalog = catalogMap();
const handles = (node: Parameters<typeof nodeExits>[0]) =>
  nodeExits(node, catalog.get(node.type)).map((e) => e.handle);

describe('nodeExits', () => {
  it('keys / digits / intents / rules / statics', () => {
    expect(
      handles(
        draftNode('m', 'gather_dtmf', {
          keys: [{ id: 'k1', key: '1', label: 'Yes' }, { id: 'k2' }, 'x'],
        }),
      ),
    ).toEqual(['key_k1', 'key_k2', 'no_input', 'invalid', 'error']);
    expect(
      nodeExits(
        draftNode('m', 'gather_dtmf', { keys: [{ id: 'k2' }] }),
        catalog.get('gather_dtmf'),
      )[0]?.label,
    ).toBe('Press ?');
    expect(handles(draftNode('m', 'gather_dtmf', { mode: 'digits' }))[0]).toBe('next');
    expect(handles(draftNode('s', 'gather_speech', {}))).toEqual(['next', 'no_input', 'error']);
    expect(
      handles(draftNode('s', 'gather_speech', { intents: [{ id: 'pay', label: '' }] })),
    ).toEqual(['intent_pay', 'no_match', 'no_input', 'error']);
    const router = nodeExits(
      draftNode('r', 'condition_router', { rules: [{ id: 'r1', label: 'Paid' }, { id: 'r2' }] }),
      catalog.get('condition_router'),
    );
    expect(router.map((e) => e.label)).toEqual(['Paid', 'Rule 2', 'Else']);
    expect(handles(draftNode('h', 'hangup'))).toEqual([]);
    expect(nodeExits(draftNode('x', 'speak'), undefined)).toEqual([]);
    expect(handles(draftNode('m', 'gather_dtmf', { keys: 'nope' }))).toEqual([
      'no_input',
      'invalid',
      'error',
    ]);
  });
});

describe('graphReducer', () => {
  it('adds, moves, labels, deletes (with edges) and connects one edge per handle', () => {
    let g = graphReducer(sampleGraph(), {
      type: 'add_node',
      node: draftNode('x', 'speak', { text: 'Hi' }),
    });
    expect(g.nodes.map((n) => n.id)).toContain('x');
    g = graphReducer(g, { type: 'move_nodes', moves: [{ id: 'x', position: { x: 5, y: 6 } }] });
    expect(g.nodes.find((n) => n.id === 'x')?.position).toEqual({ x: 5, y: 6 });
    g = graphReducer(g, { type: 'update_label', id: 'x', label: '  Hello  ' });
    expect(g.nodes.find((n) => n.id === 'x')?.label).toBe('  Hello  ');
    g = graphReducer(g, { type: 'update_label', id: 'x', label: ' ' });
    expect(g.nodes.find((n) => n.id === 'x')).not.toHaveProperty('label');
    const connected = graphReducer(g, {
      type: 'connect',
      edge: { id: 'e9', source: 'x', sourceHandle: 'next', target: 'bye' },
    });
    expect(connected.edges).toHaveLength(4);
    expect(
      graphReducer(connected, {
        type: 'connect',
        edge: { id: 'e10', source: 'x', sourceHandle: 'next', target: 'menu' },
      }),
    ).toBe(connected);
    const deleted = graphReducer(connected, { type: 'delete', nodeIds: ['bye'], edgeIds: ['e2'] });
    expect(deleted.nodes.map((n) => n.id)).not.toContain('bye');
    expect(deleted.edges.map((e) => e.id)).toEqual(['e1']);
  });

  it('config updates drop edges of exits that no longer exist; paste, replace, settings, layout', () => {
    const g = graphReducer(sampleGraph(), {
      type: 'update_config',
      id: 'menu',
      config: { keys: [] },
      handles: ['no_input'],
    });
    expect(g.edges.map((e) => e.id)).toEqual(['e1', 'e2']);
    const pasted = graphReducer(g, {
      type: 'paste',
      nodes: [draftNode('p', 'wait')],
      edges: [{ id: 'pe', source: 'p', sourceHandle: 'next', target: 'bye' }],
    });
    expect(pasted.edges.at(-1)?.id).toBe('pe');
    expect(graphReducer(pasted, { type: 'replace', graph: sampleGraph() }).nodes).toHaveLength(4);
    expect(
      graphReducer(pasted, {
        type: 'set_settings',
        settings: { ...pasted.settings, maxDurationSec: 60 },
      }).settings.maxDurationSec,
    ).toBe(60);
    const laid = graphReducer(pasted, { type: 'layout', positions: { start: { x: 9, y: 9 } } });
    expect(laid.nodes.find((n) => n.id === 'start')?.position).toEqual({ x: 9, y: 9 });
    expect(laid.nodes.find((n) => n.id === 'greet')?.position).toEqual({ x: 0, y: 120 });
  });

  it('renaming a variable updates tokens and variable fields everywhere', () => {
    const base = sampleGraph();
    base.nodes.push(
      draftNode('r', 'condition_router', {
        rules: [
          {
            id: 'r1',
            conditions: [{ variable: 'status', operator: 'equals', value: '{{ status }}' }],
          },
        ],
      }),
      draftNode('a', 'ai_agent', { agentId: 'x', passVariables: ['status', 'other'] }),
      draftNode('g', 'gather_speech', {
        saveAs: 'status',
        prompt: { kind: 'speak', text: 'Is {{status}} ok?' },
      }),
    );
    base.settings = { ...base.settings, errorMessage: 'Sorry {{status}}' };
    const g = graphReducer(base, {
      type: 'set_variables',
      variables: [{ name: 'state', type: 'text' }],
      renames: [
        { from: 'status', to: 'state' },
        { from: 'same', to: 'same' },
      ],
    });
    expect(JSON.stringify(g.nodes)).not.toContain('status');
    expect(g.nodes.find((n) => n.id === 'a')?.config.passVariables).toEqual(['state', 'other']);
    expect(g.settings.errorMessage).toBe('Sorry {{state}}');
    expect(g.variables).toEqual([{ name: 'state', type: 'text' }]);
  });
});

describe('history', () => {
  it('undo / redo, coalesced drags, skip-history edits, reset and the 50-step limit', () => {
    const { result } = renderHook(() => useGraphHistory(sampleGraph()));
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.apply({ type: 'add_node', node: draftNode('x', 'wait') }));
    act(() =>
      result.current.apply(
        { type: 'move_nodes', moves: [{ id: 'x', position: { x: 1, y: 1 } }] },
        { coalesce: 'drag-1' },
      ),
    );
    act(() =>
      result.current.apply(
        { type: 'move_nodes', moves: [{ id: 'x', position: { x: 2, y: 2 } }] },
        { coalesce: 'drag-1' },
      ),
    );
    act(() => result.current.undo());
    expect(result.current.graph.nodes.find((n) => n.id === 'x')?.position).toEqual({ x: 0, y: 0 });
    act(() => result.current.redo());
    expect(result.current.graph.nodes.find((n) => n.id === 'x')?.position).toEqual({ x: 2, y: 2 });
    act(() => result.current.redo()); // nothing to redo
    act(() =>
      result.current.apply({
        type: 'connect',
        edge: { id: 'e1x', source: 'menu', sourceHandle: 'key_k1', target: 'x' },
      }),
    ); // no-op (taken)
    act(() =>
      result.current.apply(
        { type: 'update_label', id: 'x', label: 'Quiet' },
        { skipHistory: true },
      ),
    );
    act(() => result.current.undo());
    act(() => result.current.undo());
    act(() => result.current.undo()); // nothing left
    expect(result.current.graph.nodes.map((n) => n.id)).not.toContain('x');
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) {
      act(() =>
        result.current.apply({ type: 'add_node', node: draftNode(`n${String(i)}`, 'wait') }),
      );
    }
    let undos = 0;
    while (result.current.canUndo) {
      act(() => result.current.undo());
      undos += 1;
    }
    expect(undos).toBe(HISTORY_LIMIT);
    act(() => result.current.reset(sampleGraph()));
    expect(result.current.canRedo).toBe(false);
  });
});

describe('helpers', () => {
  it('ids are 8 random [a-z0-9] chars with an optional prefix', () => {
    expect(newId('n')).toMatch(/^n_[a-z0-9]{8}$/);
    expect(newId()).toMatch(/^[a-z0-9]{8}$/);
    expect(newId('e')).not.toBe(newId('e'));
  });

  it('local issues: start, dangling edges, required exits, unreachable nodes', () => {
    expect(localIssues(sampleGraph(), catalog)).toEqual([]);
    const g = sampleGraph();
    g.nodes.push(
      draftNode('lost', 'speak', { text: 'x' }, { label: 'Lost' }),
      draftNode('s2', 'start'),
    );
    g.edges.push({ id: 'bad', source: 'greet', sourceHandle: 'error', target: 'ghost' });
    const codes = localIssues(g, catalog).map((i) => [i.code, i.nodeId ?? i.edgeId]);
    expect(codes).toEqual(
      expect.arrayContaining([
        ['start_multiple', 's2'],
        ['edge_invalid', 'bad'],
        ['exit_required', 'lost'],
        ['node_unreachable', 'lost'],
      ]),
    );
    expect(
      localIssues({ ...g, nodes: g.nodes.filter((n) => n.type !== 'start') }, catalog)[0]?.code,
    ).toBe('start_missing');
    expect(localIssues(g, catalog).find((i) => i.nodeId === 'lost')?.message).toContain('"Lost"');
    expect(
      localIssues(
        { ...sampleGraph(), nodes: [draftNode('s', 'start'), draftNode('z', 'wait')], edges: [] },
        new Map(),
      ).map((i) => i.message),
    ).toContain('"wait" can\'t be reached from Start.');
  });

  it('layout puts nodes top to bottom, deterministic', () => {
    const p = layoutGraph(sampleGraph());
    expect(p.start!.y).toBeLessThan(p.greet!.y);
    expect(p.greet!.y + NODE_HEIGHT).toBeLessThanOrEqual(p.menu!.y);
    expect(layoutGraph(sampleGraph())).toEqual(p);
    expect(
      layoutGraph({
        nodes: sampleGraph().nodes,
        edges: [{ id: 'x', source: 'a', sourceHandle: 'next', target: 'b' }],
      }),
    ).toHaveProperty('start');
  });
});

describe('freeSpot', () => {
  it('keeps a free spot and steps right past occupied ones', () => {
    expect(freeSpot([], { x: 10.4, y: 20.6 })).toEqual({ x: 10, y: 21 });
    const nodes = [{ position: { x: 0, y: 0 } }, { position: { x: PLACE_STEP_X + 10, y: 15 } }];
    expect(freeSpot(nodes, { x: 5, y: 5 })).toEqual({ x: 2 * PLACE_STEP_X + 5, y: 5 });
    // far enough below → free
    expect(freeSpot(nodes, { x: 0, y: 100 })).toEqual({ x: 0, y: 100 });
  });
});

describe('visibleCentre', () => {
  it('uses the canvas box, falling back to the window', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 200 }) as DOMRect;
    expect(visibleCentre(el)).toEqual({ x: 300, y: 150 });
    expect(visibleCentre(null)).toEqual({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    // not laid out yet (width 0) → window centre
    expect(visibleCentre(document.createElement('div'))).toEqual({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
  });
});
