/**
 * 网络数据（nebula 图）的索引与查询。
 * 提供节点度、邻接关系、焦点扩散与最短路径等只读派生数据。
 */
import { LANGUAGES } from '../../core/constants.js';
import { pickEdgeText, pickEdgeTextWithFallback } from './node-fields.js';

export function normalizeData(data) {
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('JSON 需要包含 nodes 和 edges 数组');
  }
  data.nodes.forEach((node) => {
    node.properties = node.properties || {};
  });
  data.edges.forEach((edge) => {
    edge.properties = edge.properties || {};
  });
  return data;
}

const NODE_NAME_FIELDS = ['name_zh', 'name_en'];

export function createIndex() {
  return {
    nodeById: new Map(),
    nodeByKey: new Map(),
    degreeById: new Map(),
    undirectedById: new Map(),
    outgoingById: new Map(),
    relatedById: new Map()
  };
}

export function rebuildIndexes(data, index) {
  const nodes = data.nodes || [];
  const edges = data.edges || [];

  index.nodeById = new Map(nodes.map((node) => [node.vid, node]));
  buildKeyLookup(nodes, index);
  index.degreeById = new Map(nodes.map((node) => [node.vid, createDegree()]));
  index.undirectedById = new Map(nodes.map((node) => [node.vid, []]));
  index.outgoingById = new Map(nodes.map((node) => [node.vid, []]));
  index.relatedById = new Map(nodes.map((node) => [node.vid, []]));

  edges.forEach((edge) => {
    const sourceDegree = index.degreeById.get(edge.source_vid) || createDegree();
    const targetDegree = index.degreeById.get(edge.target_vid) || createDegree();

    sourceDegree.out += 1;
    sourceDegree.total += 1;
    targetDegree.in += 1;
    targetDegree.total += 1;

    index.degreeById.set(edge.source_vid, sourceDegree);
    index.degreeById.set(edge.target_vid, targetDegree);

    index.undirectedById.get(edge.source_vid)?.push({ nodeId: edge.target_vid, edge });
    index.undirectedById.get(edge.target_vid)?.push({ nodeId: edge.source_vid, edge });
    index.outgoingById.get(edge.source_vid)?.push({ nodeId: edge.target_vid, edge });

    const sourceNode = index.nodeById.get(edge.source_vid);
    const targetNode = index.nodeById.get(edge.target_vid);
    if (sourceNode && targetNode) {
      index.relatedById.get(edge.source_vid)?.push({ node: targetNode, edge });
    }
  });
}

export function emptyDegree() {
  return createDegree();
}

function createDegree() {
  return { in: 0, out: 0, total: 0 };
}

/**
 * 建立「任意标识 -> 节点」的查找表。
 *
 * 语义搜索的返回只有中英文名称、没有节点 id，因此需要按名称反查；
 * 而不同业务的节点 id 形态不一（SCP 为 SCP-015，genshin 可能为英文名），
 * 故把 id（含小写）与名称都收进同一张表。
 * 先写 id 再写名称，保证 id 精确匹配优先于名称匹配，避免同名覆盖。
 */
function buildKeyLookup(nodes, index) {
  const lookup = new Map();
  nodes.forEach((node) => {
    if (node.vid) lookup.set(node.vid, node);
  });
  nodes.forEach((node) => {
    const lowerId = String(node.vid || '').toLowerCase();
    if (lowerId && !lookup.has(lowerId)) lookup.set(lowerId, node);
  });
  nodes.forEach((node) => {
    NODE_NAME_FIELDS.forEach((field) => {
      const name = String(node.properties?.[field] ?? '').trim();
      if (name && !lookup.has(name)) lookup.set(name, node);
    });
  });
  index.nodeByKey = lookup;
}

/**
 * 按标识取节点，找不到返回 undefined。
 * 调用方应按"从精确 to 宽松"的顺序依次尝试。
 */
export function findNodeByKey(index, identifier) {
  const key = String(identifier ?? '').trim();
  if (!key) return undefined;
  return index.nodeByKey.get(key);
}

/** 边的稳定标识，用于高亮与去重。 */
export function edgeKey(edge) {
  return `${edge.source_vid}->${edge.target_vid}::${edge.id || pickEdgeTextWithFallback(edge, LANGUAGES.EN) || ''}`;
}

/** 相关关系的去重键：端点 + 中英文文案，避免同关系被重复展示。 */
function relatedEdgeKey({ edge }) {
  return [
    edge.source_vid,
    edge.target_vid,
    pickEdgeText(edge, LANGUAGES.ZH),
    pickEdgeText(edge, LANGUAGES.EN)
  ].join('::');
}

/** 汇总某节点的出边关联，同一对端点的多条关系合并为一组。 */
export function getRelatedNodes(index, nodeId) {
  const groups = new Map();

  for (const item of index.relatedById.get(nodeId) || []) {
    const relatedId = item.node.vid;
    let group = groups.get(relatedId);
    if (!group) {
      group = { node: item.node, relations: [], relationKeys: new Set() };
      groups.set(relatedId, group);
    }

    const key = relatedEdgeKey(item);
    if (!group.relationKeys.has(key)) {
      group.relationKeys.add(key);
      group.relations.push({ edge: item.edge });
    }
  }

  return [...groups.values()].map(({ node, relations }) => ({ node, relations }));
}
