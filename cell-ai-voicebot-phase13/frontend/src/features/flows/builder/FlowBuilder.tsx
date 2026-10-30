import '@xyflow/react/dist/style.css';

import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import RedoOutlined from '@mui/icons-material/RedoOutlined';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import UndoOutlined from '@mui/icons-material/UndoOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type IsValidConnection,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import { enqueueSnackbar } from 'notistack';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';

import { useUnsavedChangesGuard } from '@/components/fields/useUnsavedChangesGuard';
import { agentKeys } from '@/features/agents/keys';
import { useSession } from '@/features/auth/hooks';
import { agentsApi } from '@/services/api/agents';
import { getErrorMessage, isApiError } from '@/services/api/errors';
import { flowsApi } from '@/services/api/flows';
import type {
  DraftGraph,
  DraftNode,
  Flow,
  FlowCatalog,
  FlowEdge,
  FlowIssue,
  FlowNodeStat,
  FlowNodeType,
} from '@/services/api/types';

import { nodeExits } from '../graph/exits';
import { useGraphHistory } from '../graph/history';
import { newId } from '../graph/ids';
import { layoutGraph } from '../graph/layout';
import { localIssues } from '../graph/local-issues';
import { freeSpot, visibleCentre } from '../graph/place';
import { flowKeys } from '../keys';
import { statusColor, statusLabel } from '../labels';
import { useFlowAudio, useFlowLiveUpdates } from '../queries';

import { ConflictDialog } from './ConflictDialog';
import { FlowNodeCard, type FlowCanvasNode } from './FlowNodeCard';
import { Inspector } from './Inspector';
import { IssuesPanel } from './IssuesPanel';
import { DRAG_TYPE, Palette } from './Palette';
import { PublishDialog } from './PublishDialog';
import { nodeSummary } from './summary';

const NODE_TYPES = { flowNode: FlowNodeCard };
const PASTE_OFFSET = 40;

/** Graph without the viewport (what "changed" means). */
const contentOf = (g: DraftGraph) => {
  const { viewport: _v, ...rest } = g;
  return JSON.stringify(rest);
};

/** API issues → builder issues (`FLOW_INVALID` details on publish). */
const issuesFromError = (err: unknown): FlowIssue[] | null => {
  if (!isApiError(err) || err.code !== 'FLOW_INVALID') return null;
  return err.details.map((d) => ({
    severity: d.severity ?? 'error',
    code: (d.issue ?? 'node_unconfigured') as FlowIssue['code'],
    message: d.message,
    ...(d.nodeId ? { nodeId: d.nodeId } : {}),
    ...(d.edgeId ? { edgeId: d.edgeId } : {}),
    field: d.path,
  }));
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export interface BuilderExtras {
  /** Node to highlight (simulator follow). */
  highlightId?: string | null;
  /** Node stats overlay. */
  stats?: ReadonlyMap<string, FlowNodeStat>;
}

export interface FlowBuilderProps extends BuilderExtras {
  flow: Flow;
  catalog: FlowCatalog;
  /** No edits at all (role, impersonation, small screen, version view). */
  readOnly: boolean;
  readOnlyReason?: string;
  canPublish: boolean;
  /** A published version shown instead of the draft (read-only). */
  version?: { number: number; graph: DraftGraph } | undefined;
  /** Extra toolbar buttons (simulator, stats). */
  toolbar?: ReactNode;
  /** Side panel (simulator drawer) next to the canvas. */
  side?: ReactNode;
  /** Settings form of the selected step (T6.13). */
  renderForm?: (
    node: DraftNode,
    apply: (config: Record<string, unknown>) => void,
    readOnly: boolean,
    context: { graph: DraftGraph; fieldErrors: Record<string, string> },
  ) => ReactNode;
  /** Builder-level dialogs (flow settings / variables) — receive the graph and an apply function. */
  renderDialogs?: (
    graph: DraftGraph,
    apply: ReturnType<typeof useGraphHistory>['apply'],
    readOnly: boolean,
  ) => ReactNode;
  /** Reports the latest graph / dirty state (simulator needs it). */
  onState?: (state: { graph: DraftGraph; dirty: boolean; revision: number }) => void;
}

/** Applies React Flow "select" changes to a list of selected ids. */
const applyPicks = (ids: string[], picks: { id: string; selected: boolean }[]): string[] => {
  const next = new Set(ids);
  for (const p of picks) {
    if (p.selected) next.add(p.id);
    else next.delete(p.id);
  }
  return next.size === ids.length && ids.every((id) => next.has(id)) ? ids : [...next];
};

function Builder({
  flow,
  catalog,
  readOnly,
  readOnlyReason,
  canPublish,
  version,
  toolbar,
  side,
  renderForm,
  renderDialogs,
  onState,
  highlightId,
  stats,
}: FlowBuilderProps) {
  const initial = version?.graph ?? flow.draft;
  const history = useGraphHistory(initial);
  const { graph, apply } = history;
  const [revision, setRevision] = useState(flow.revision);
  const [savedContent, setSavedContent] = useState(() => contentOf(initial));
  const [serverIssues, setServerIssues] = useState<FlowIssue[]>(version ? [] : flow.issues);
  /** What "Validate" found for a graph — shown while that exact graph is on screen. */
  const [validated, setValidated] = useState<{ graph: DraftGraph; issues: FlowIssue[] } | null>(
    null,
  );
  const [selected, setSelected] = useState<{ nodes: string[]; edges: string[] }>({
    nodes: [],
    edges: [],
  });
  const [conflict, setConflict] = useState<{ by: string | null } | null>(null);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const clipboard = useRef<{ nodes: DraftNode[]; edges: FlowEdge[] } | null>(null);
  const dragSession = useRef(0);
  const viewport = useRef(graph.viewport);
  const canvasBox = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useSession();
  const catalogMap = useMemo(() => new Map(catalog.nodes.map((n) => [n.type, n])), [catalog]);
  const dirty = !version && contentOf(graph) !== savedContent;
  useUnsavedChangesGuard(dirty);

  useEffect(() => {
    onState?.({ graph, dirty, revision });
  }, [graph, dirty, revision, onState]);

  // names for node summaries
  const agents = useQuery({
    queryKey: agentKeys.list({ limit: 100 }),
    queryFn: () => agentsApi.list({ limit: 100 }),
  });
  const audio = useFlowAudio();
  const names = useMemo(
    () => ({
      agents: new Map((agents.data?.data ?? []).map((a) => [a.id, a.name])),
      audios: new Map((audio.data ?? []).map((a) => [a.id, a.name])),
    }),
    [agents.data, audio.data],
  );

  const issues = useMemo(
    () =>
      validated?.graph === graph
        ? validated.issues
        : !dirty
          ? serverIssues
          : [
              ...localIssues(graph, catalogMap),
              ...serverIssues.filter((i) => i.severity === 'warning'),
            ],
    [dirty, graph, catalogMap, serverIssues, validated],
  );
  const issuesByNode = useMemo(() => {
    const map = new Map<string, { errors: number; warnings: number }>();
    for (const i of issues) {
      if (!i.nodeId) continue;
      const c = map.get(i.nodeId) ?? { errors: 0, warnings: 0 };
      if (i.severity === 'error') c.errors += 1;
      else c.warnings += 1;
      map.set(i.nodeId, c);
    }
    return map;
  }, [issues]);

  const nodes: FlowCanvasNode[] = useMemo(
    () =>
      graph.nodes.map((node) => {
        const entry = catalogMap.get(node.type);
        return {
          id: node.id,
          type: 'flowNode',
          position: node.position,
          selected: selected.nodes.includes(node.id),
          deletable: !readOnly && node.type !== 'start',
          data: {
            node,
            entry,
            exits: nodeExits(node, entry),
            summary: nodeSummary(node, names),
            errorCount: issuesByNode.get(node.id)?.errors ?? 0,
            warningCount: issuesByNode.get(node.id)?.warnings ?? 0,
            stat: stats?.get(node.id),
            highlighted: highlightId === node.id,
          },
        };
      }),
    [graph.nodes, catalogMap, selected.nodes, readOnly, names, issuesByNode, stats, highlightId],
  );
  const edges: Edge[] = useMemo(
    () =>
      graph.edges.map((e) => {
        const source = graph.nodes.find((n) => n.id === e.source);
        const exit = source
          ? nodeExits(source, catalogMap.get(source.type)).find((x) => x.handle === e.sourceHandle)
          : undefined;
        return {
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: 'in',
          label: exit?.label ?? e.sourceHandle,
          selected: selected.edges.includes(e.id),
          style: exit?.kind === 'error' ? { stroke: '#d32f2f' } : undefined,
        };
      }),
    [graph.edges, graph.nodes, catalogMap, selected.edges],
  );

  // ── editing ───────────────────────────────────────────────────────────────

  const addNode = useCallback(
    (type: FlowNodeType, position?: { x: number; y: number }) => {
      const entry = catalogMap.get(type);
      const at = position ?? rf.screenToFlowPosition(visibleCentre(canvasBox.current));
      const node: DraftNode = {
        id: newId('n'),
        type,
        position: freeSpot(graph.nodes, at),
        config: structuredClone(entry?.defaults ?? {}),
      };
      apply({ type: 'add_node', node });
      setSelected({ nodes: [node.id], edges: [] });
    },
    [apply, catalogMap, rf, graph.nodes],
  );

  const removeSelection = useCallback(
    (nodeIds: string[], edgeIds: string[]) => {
      const deletable = nodeIds.filter(
        (id) => graph.nodes.find((n) => n.id === id)?.type !== 'start',
      );
      if (!deletable.length && !edgeIds.length) return;
      apply({ type: 'delete', nodeIds: deletable, edgeIds });
      setSelected({ nodes: [], edges: [] });
    },
    [apply, graph.nodes],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowCanvasNode>[]) => {
      const moves = changes.flatMap((c) =>
        c.type === 'position' && c.position
          ? [{ id: c.id, position: { x: Math.round(c.position.x), y: Math.round(c.position.y) } }]
          : [],
      );
      if (moves.length)
        apply({ type: 'move_nodes', moves }, { coalesce: `drag:${String(dragSession.current)}` });
      const removed = changes.flatMap((c) => (c.type === 'remove' ? [c.id] : []));
      if (removed.length) removeSelection(removed, []);
      // nodes are controlled: a click only selects once we apply its "select" change
      const picks = changes.flatMap((c) => (c.type === 'select' ? [c] : []));
      if (picks.length) setSelected((prev) => ({ ...prev, nodes: applyPicks(prev.nodes, picks) }));
    },
    [apply, removeSelection],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removed = changes.flatMap((c) => (c.type === 'remove' ? [c.id] : []));
      if (removed.length) removeSelection([], removed);
      const picks = changes.flatMap((c) => (c.type === 'select' ? [c] : []));
      if (picks.length) setSelected((prev) => ({ ...prev, edges: applyPicks(prev.edges, picks) }));
    },
    [removeSelection],
  );

  const isValidConnection: IsValidConnection = useCallback(
    (c) => {
      const target = graph.nodes.find((n) => n.id === c.target);
      if (!target || target.type === 'start' || !c.sourceHandle) return false;
      return !graph.edges.some((e) => e.source === c.source && e.sourceHandle === c.sourceHandle);
    },
    [graph],
  );
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.sourceHandle) return;
      if (graph.edges.some((e) => e.source === c.source && e.sourceHandle === c.sourceHandle)) {
        enqueueSnackbar('Remove the existing connection first', { variant: 'info' });
        return;
      }
      apply({
        type: 'connect',
        edge: { id: newId('e'), source: c.source, sourceHandle: c.sourceHandle, target: c.target },
      });
    },
    [apply, graph.edges],
  );
  const onSelectionChange = useCallback(({ nodes: n, edges: e }: OnSelectionChangeParams) => {
    setSelected({ nodes: n.map((x) => x.id), edges: e.map((x) => x.id) });
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData(DRAG_TYPE) as FlowNodeType;
    if (!type || readOnly) return;
    addNode(type, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  const copy = useCallback(() => {
    const ids = new Set(
      selected.nodes.filter((id) => graph.nodes.find((n) => n.id === id)?.type !== 'start'),
    );
    if (!ids.size) return;
    clipboard.current = {
      nodes: graph.nodes.filter((n) => ids.has(n.id)),
      edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    };
  }, [graph, selected.nodes]);
  const paste = useCallback(() => {
    const clip = clipboard.current;
    if (!clip) return;
    const idMap = new Map(clip.nodes.map((n) => [n.id, newId('n')]));
    const nodesCopy = clip.nodes.map((n) => ({
      ...structuredClone(n),
      id: idMap.get(n.id) ?? newId('n'),
      position: { x: n.position.x + PASTE_OFFSET, y: n.position.y + PASTE_OFFSET },
    }));
    const edgesCopy = clip.edges.map((e) => ({
      id: newId('e'),
      source: idMap.get(e.source) ?? e.source,
      sourceHandle: e.sourceHandle,
      target: idMap.get(e.target) ?? e.target,
    }));
    apply({ type: 'paste', nodes: nodesCopy, edges: edgesCopy });
    setSelected({ nodes: nodesCopy.map((n) => n.id), edges: [] });
    clipboard.current = { nodes: nodesCopy, edges: edgesCopy };
  }, [apply]);

  // ── saving / publishing ───────────────────────────────────────────────────

  const resetTo = useCallback(
    (fresh: Flow) => {
      const g = fresh.draft as unknown as DraftGraph;
      history.reset(g);
      setRevision(fresh.revision);
      setSavedContent(contentOf(g));
      setServerIssues(fresh.issues);
      setValidated(null);
      setChangedElsewhere(false);
      setConflict(null);
    },
    [history],
  );

  const save = useMutation({
    mutationFn: () =>
      flowsApi.saveDraft(flow.id, revision, {
        ...graph,
        ...(viewport.current ? { viewport: viewport.current } : {}),
      }),
    onSuccess: (result) => {
      setRevision(result.revision);
      setSavedContent(contentOf(graph));
      setServerIssues(result.issues);
      setValidated(null);
      void queryClient.invalidateQueries({ queryKey: flowKeys.lists });
      enqueueSnackbar('Saved', { variant: 'success' });
    },
    onError: (err) => {
      if (isApiError(err) && err.code === 'FLOW_REVISION_CONFLICT') {
        setConflict({ by: err.details.find((d) => d.path === 'updatedBy')?.message || null });
        return;
      }
      enqueueSnackbar(getErrorMessage(err), { variant: 'error' });
    },
  });
  const reload = useMutation({
    mutationFn: () => flowsApi.get(flow.id),
    onSuccess: (fresh) => {
      resetTo(fresh);
      queryClient.setQueryData(flowKeys.detail(flow.id), fresh);
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const saveCopy = useMutation({
    mutationFn: () =>
      flowsApi.importFile(
        {
          format: 'cell-ai-flow',
          schemaVersion: 1,
          name: flow.name,
          description: flow.description,
          graph,
        },
        `${flow.name.slice(0, 64)} (my changes)`,
      ),
    onSuccess: (result) => {
      setSavedContent(contentOf(graph)); // leave without the unsaved prompt
      setConflict(null);
      enqueueSnackbar(`Saved as "${result.flow.name}"`, { variant: 'success' });
      void navigate(`/flows/${result.flow.id}`);
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const publish = useMutation({
    mutationFn: (notes: string) => flowsApi.publish(flow.id, revision, notes || null),
    onSuccess: (v) => {
      setPublishOpen(false);
      void queryClient.invalidateQueries({ queryKey: flowKeys.all });
      enqueueSnackbar(`Published v${String(v.version)}`, { variant: 'success' });
    },
    onError: (err) => {
      const fromServer = issuesFromError(err);
      if (fromServer) {
        setServerIssues(fromServer);
        setValidated(null);
      } else if (isApiError(err) && err.code === 'FLOW_REVISION_CONFLICT')
        setConflict({ by: null });
      enqueueSnackbar(getErrorMessage(err), { variant: 'error' });
    },
  });
  const validate = useMutation({
    mutationFn: (checked: DraftGraph) => flowsApi.validate(flow.id, checked),
    onSuccess: (found, checked) => {
      setValidated({ graph: checked, issues: found });
      enqueueSnackbar(
        found.some((i) => i.severity === 'error') ? 'Problems found' : 'No problems found',
        {
          variant: found.some((i) => i.severity === 'error') ? 'warning' : 'success',
        },
      );
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const duplicate = useMutation({
    mutationFn: () => flowsApi.duplicate(flow.id),
    onSuccess: (copy) => void navigate(`/flows/${copy.id}`),
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const exportFlow = useMutation({
    mutationFn: () => flowsApi.exportFile(flow.id, version?.number ?? 'draft'),
    onSuccess: async (file) => (await import('../download')).downloadJson(file.fileName, file.data),
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });

  useFlowLiveUpdates({
    flowId: flow.id,
    onUpdated: (rev, by) => {
      if (version || rev <= revision || by === session?.user.id) return;
      if (dirty) setChangedElsewhere(true);
      else reload.mutate();
    },
  });

  // ── keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (key === 'escape') setSelected({ nodes: [], edges: [] });
      if (!mod || readOnly) return;
      if (key === 's') {
        e.preventDefault();
        if (dirty && !save.isPending) save.mutate();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        history.redo();
      } else if (key === 'z') {
        e.preventDefault();
        history.undo();
      } else if (key === 'c') copy();
      else if (key === 'v') paste();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readOnly, dirty, save, history, copy, paste]);

  const autoLayout = () => {
    setMenu(null);
    apply({ type: 'layout', positions: layoutGraph(graph) });
    window.setTimeout(() => void rf.fitView(), 0);
  };
  const focusNode = (nodeId: string) => {
    const n = graph.nodes.find((x) => x.id === nodeId);
    if (!n) return;
    setSelected({ nodes: [nodeId], edges: [] });
    void rf.setCenter(n.position.x + 120, n.position.y + 45, { zoom: 1, duration: 300 });
  };

  const selectedNode =
    selected.nodes.length === 1 ? graph.nodes.find((n) => n.id === selected.nodes[0]) : undefined;
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 112px)',
        minHeight: 480,
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', flexWrap: 'wrap', pb: 1, gap: 1 }}
      >
        <IconButton component={RouterLink} to="/flows" aria-label="Back to flows">
          <ArrowBackOutlined />
        </IconButton>
        <AccountTreeOutlined color="action" />
        <Typography variant="h6" component="h1" noWrap sx={{ maxWidth: 320 }}>
          {flow.name}
        </Typography>
        <Chip
          size="small"
          label={version ? `Viewing v${String(version.number)}` : statusLabel(flow)}
          color={version ? 'default' : statusColor(flow.status)}
        />
        {!version && (
          <Typography
            variant="caption"
            color={dirty ? 'warning.main' : 'text.secondary'}
            aria-live="polite"
          >
            {dirty ? 'Unsaved changes' : `Saved · revision ${String(revision)}`}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {toolbar}
        {!readOnly && (
          <>
            <Tooltip title="Undo (Ctrl+Z)">
              <span>
                <IconButton aria-label="Undo" onClick={history.undo} disabled={!history.canUndo}>
                  <UndoOutlined />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Redo (Ctrl+Shift+Z)">
              <span>
                <IconButton aria-label="Redo" onClick={history.redo} disabled={!history.canRedo}>
                  <RedoOutlined />
                </IconButton>
              </span>
            </Tooltip>
            <Button onClick={() => validate.mutate(graph)} disabled={validate.isPending}>
              Validate
            </Button>
            <Button
              variant="outlined"
              startIcon={<SaveOutlined />}
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
            >
              Save
            </Button>
          </>
        )}
        {!version && canPublish && (
          <Tooltip title={dirty ? 'Save first' : ''}>
            <span>
              <Button
                variant="contained"
                onClick={() => setPublishOpen(true)}
                disabled={dirty || readOnly}
              >
                Publish
              </Button>
            </span>
          </Tooltip>
        )}
        <Button
          component={RouterLink}
          to={`/flows/${flow.id}/versions`}
          startIcon={<HistoryOutlined />}
        >
          Versions
        </Button>
        <IconButton aria-label="More" onClick={(e) => setMenu(e.currentTarget)}>
          <MoreVertOutlined />
        </IconButton>
        <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
          {!readOnly && <MenuItem onClick={autoLayout}>Auto-layout</MenuItem>}
          {!readOnly && (
            <MenuItem
              onClick={() => {
                setMenu(null);
                duplicate.mutate();
              }}
            >
              Duplicate
            </MenuItem>
          )}
          {!readOnly && (
            <MenuItem
              onClick={() => {
                setMenu(null);
                exportFlow.mutate();
              }}
            >
              Export JSON
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              setMenu(null);
              void rf.fitView();
            }}
          >
            Fit to screen
          </MenuItem>
        </Menu>
      </Stack>
      {readOnly && readOnlyReason && (
        <Alert severity="info" sx={{ mb: 1 }}>
          {readOnlyReason}
        </Alert>
      )}
      {changedElsewhere && (
        <Alert
          severity="warning"
          sx={{ mb: 1 }}
          action={
            <Button color="inherit" size="small" onClick={() => reload.mutate()}>
              Reload
            </Button>
          }
        >
          This flow was updated elsewhere.
        </Alert>
      )}
      {renderDialogs?.(graph, apply, readOnly)}
      <Box
        sx={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        {!readOnly && <Palette catalog={catalog} onAdd={(t) => addNode(t)} />}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{ flex: 1, minHeight: 0 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            data-testid="flow-canvas"
            ref={canvasBox}
          >
            <ReactFlow<FlowCanvasNode>
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onSelectionChange={onSelectionChange}
              onNodeDragStart={() => {
                dragSession.current += 1;
              }}
              onMoveEnd={(_e, vp) => {
                viewport.current = vp;
              }}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              edgesFocusable={!readOnly}
              deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
              snapToGrid
              snapGrid={[16, 16]}
              defaultViewport={graph.viewport}
              fitView={!graph.viewport}
              proOptions={{ hideAttribution: true }}
              aria-label="Flow canvas"
            >
              <Background gap={16} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </Box>
          <IssuesPanel issues={issues} onFocus={focusNode} />
        </Box>
        {selectedNode && (
          <Inspector
            key={selectedNode.id}
            node={selectedNode}
            entry={catalogMap.get(selectedNode.type)}
            readOnly={readOnly}
            onLabel={(label) =>
              apply(
                { type: 'update_label', id: selectedNode.id, label },
                { coalesce: `label:${selectedNode.id}` },
              )
            }
            onDelete={() => removeSelection([selectedNode.id], [])}
          >
            {renderForm?.(
              selectedNode,
              (config) =>
                apply(
                  {
                    type: 'update_config',
                    id: selectedNode.id,
                    config,
                    handles: nodeExits(
                      { ...selectedNode, config },
                      catalogMap.get(selectedNode.type),
                    ).map((x) => x.handle),
                  },
                  { coalesce: `config:${selectedNode.id}` },
                ),
              readOnly,
              {
                graph,
                fieldErrors: Object.fromEntries(
                  issues
                    .filter((i) => i.nodeId === selectedNode.id && i.field?.startsWith('config'))
                    .map((i) => [(i.field ?? '').replace(/^config\.?/, ''), i.message]),
                ),
              },
            )}
          </Inspector>
        )}
        {side}
      </Box>
      {publishOpen && (
        <PublishDialog
          issues={issues}
          busy={publish.isPending}
          onClose={() => setPublishOpen(false)}
          onPublish={(n) => publish.mutate(n)}
        />
      )}
      {conflict && (
        <ConflictDialog
          by={conflict.by}
          busy={reload.isPending || saveCopy.isPending}
          onReload={() => reload.mutate()}
          onSaveCopy={() => saveCopy.mutate()}
          onClose={() => setConflict(null)}
        />
      )}
      <Typography variant="caption" color="text.secondary" sx={{ pt: 0.5 }}>
        {errorCount
          ? `${String(errorCount)} problem${errorCount === 1 ? '' : 's'} to fix before publishing`
          : ' '}
      </Typography>
    </Box>
  );
}

/** The flow builder (needs a React Flow provider for screen ↔ canvas positions). */
export function FlowBuilder(props: FlowBuilderProps) {
  return (
    <ReactFlowProvider>
      <Builder {...props} />
    </ReactFlowProvider>
  );
}
