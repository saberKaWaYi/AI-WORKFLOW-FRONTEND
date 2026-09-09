/**
 * 拓扑视图的筛选算法：焦点扩散与最短路径。
 * 纯函数，仅依赖索引与筛选条件，不涉及 DOM 与渲染状态。
 */
import { edgeKey } from '../../systems/data/network-index.js';

export const EMPTY_PATH_SELECTION = Object.freeze({
  active: false,
  found: false,
  nodeIds: new Set(),
  edgeKeys: new Set(),
  steps: 0
});

const INACTIVE_FOCUS = Object.freeze({ active: false, nodeIds: new Set() });

/** 以指定节点为中心，按层数向外扩散，返回可达节点集合。 */
export function buildFocusSelection({ filters, index }) {
  const startId = filters.focusNodeId;
  if (!startId || !index.nodeById.has(startId)) return INACTIVE_FOCUS;

  const maxDepth = Math.max(1, filters.focusDepth);
  const nodeIds = new Set([startId]);
  const queue = [{ nodeId: startId, depth: 0 }];

  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= maxDepth) continue;
    for (const next of index.undirectedById.get(current.nodeId) || []) {
      if (nodeIds.has(next.nodeId)) continue;
      nodeIds.add(next.nodeId);
      queue.push({ nodeId: next.nodeId, depth: current.depth + 1 });
    }
  }

  return { active: true, startId, depth: maxDepth, nodeIds };
}

/** 在有向图中求 source -> target 的最短路径，返回路径上的节点与边。 */
export function buildPathSelection({ filters, index }) {
  const sourceId = filters.pathSourceId;
  const targetId = filters.pathTargetId;

  if (!sourceId || !targetId || !index.nodeById.has(sourceId) || !index.nodeById.has(targetId)) {
    return EMPTY_PATH_SELECTION;
  }

  if (sourceId === targetId) {
    return { active: true, found: true, sourceId, targetId, nodeIds: new Set([sourceId]), edgeKeys: new Set(), steps: 0 };
  }

  const queue = [sourceId];
  const visited = new Set([sourceId]);
  const previous = new Map();

  while (queue.length) {
    const currentId = queue.shift();
    for (const next of index.outgoingById.get(currentId) || []) {
      if (visited.has(next.nodeId)) continue;
      visited.add(next.nodeId);
      previous.set(next.nodeId, { fromId: currentId, edge: next.edge });
      if (next.nodeId === targetId) return resolvePath(sourceId, targetId, previous);
      queue.push(next.nodeId);
    }
  }

  return {
    active: true,
    found: false,
    sourceId,
    targetId,
    nodeIds: new Set([sourceId, targetId]),
    edgeKeys: new Set(),
    steps: 0
  };
}

/** 由前驱表回溯出完整路径。 */
function resolvePath(sourceId, targetId, previous) {
  const nodeIds = new Set([targetId]);
  const edgeKeys = new Set();
  let currentId = targetId;
  let steps = 0;

  while (currentId !== sourceId) {
    const item = previous.get(currentId);
    if (!item) break;
    steps += 1;
    edgeKeys.add(edgeKey(item.edge));
    nodeIds.add(item.fromId);
    currentId = item.fromId;
  }

  return { active: true, found: true, sourceId, targetId, nodeIds, edgeKeys, steps };
}
