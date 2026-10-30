import { graphlib, layout } from '@dagrejs/dagre';

import type { DraftGraph } from '@/services/api/types';

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 90;

/** Top-to-bottom auto-layout (dagre) → node id → position (top-left). Pure. */
export const layoutGraph = (
  graph: Pick<DraftGraph, 'nodes' | 'edges'>,
): Record<string, { x: number; y: number }> => {
  const g = new graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 70 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of graph.nodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of graph.edges)
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  layout(g);
  return Object.fromEntries(
    graph.nodes.map((n) => {
      const p = g.node(n.id) as { x: number; y: number };
      return [n.id, { x: Math.round(p.x - NODE_WIDTH / 2), y: Math.round(p.y - NODE_HEIGHT / 2) }];
    }),
  );
};
