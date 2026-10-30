import type { DraftGraph, FlowIssue, FlowNodeCatalogEntry } from '@/services/api/types';

import { nodeExits } from './exits';

/**
 * Instant structural checks while editing (the server's issues after a save
 * are the real ones): start count, dangling / unreachable nodes, unconnected
 * required exits, edges to missing nodes.
 */
export const localIssues = (
  graph: DraftGraph,
  catalog: Map<string, FlowNodeCatalogEntry>,
): FlowIssue[] => {
  const issues: FlowIssue[] = [];
  const ids = new Set(graph.nodes.map((n) => n.id));
  const label = (n: { label?: string; type: string }) =>
    `"${n.label?.trim() || catalog.get(n.type)?.label || n.type}"`;
  const starts = graph.nodes.filter((n) => n.type === 'start');
  if (!starts.length)
    issues.push({ severity: 'error', code: 'start_missing', message: 'Add a Start node.' });
  for (const extra of starts.slice(1)) {
    issues.push({
      severity: 'error',
      code: 'start_multiple',
      nodeId: extra.id,
      message: 'Only one Start node is allowed.',
    });
  }
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      issues.push({
        severity: 'error',
        code: 'edge_invalid',
        edgeId: e.id,
        message: 'This connection points to a node that does not exist.',
      });
    }
  }
  for (const node of graph.nodes) {
    const connected = new Set(
      graph.edges.filter((e) => e.source === node.id).map((e) => e.sourceHandle),
    );
    for (const x of nodeExits(node, catalog.get(node.type))) {
      if (x.required && !connected.has(x.handle)) {
        issues.push({
          severity: 'error',
          code: 'exit_required',
          nodeId: node.id,
          field: `exits.${x.handle}`,
          message: `${label(node)}: "${x.label}" is not connected to a next step.`,
        });
      }
    }
  }
  const start = starts[0];
  if (start) {
    const seen = new Set([start.id]);
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift() as string;
      for (const e of graph.edges) {
        if (e.source === id && !seen.has(e.target)) {
          seen.add(e.target);
          queue.push(e.target);
        }
      }
    }
    for (const node of graph.nodes) {
      if (!seen.has(node.id)) {
        issues.push({
          severity: 'error',
          code: 'node_unreachable',
          nodeId: node.id,
          message: `${label(node)} can't be reached from Start.`,
        });
      }
    }
  }
  return issues;
};
