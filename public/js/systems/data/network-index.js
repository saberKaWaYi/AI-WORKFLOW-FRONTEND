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

export function createIndex() {
  return {
    nodeById: new Map(),
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
  index.degreeById = new Map(nodes.map((node) => [node.vid, { in: 0, out: 0, total: 0 }]));
  index.undirectedById = new Map(nodes.map((node) => [node.vid, []]));
  index.outgoingById = new Map(nodes.map((node) => [node.vid, []]));
  index.relatedById = new Map(nodes.map((node) => [node.vid, []]));

  edges.forEach((edge) => {
    const sourceDegree = index.degreeById.get(edge.source_vid) || { in: 0, out: 0, total: 0 };
    const targetDegree = index.degreeById.get(edge.target_vid) || { in: 0, out: 0, total: 0 };

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

export function edgeKey(edge) {
  return `${edge.source_vid}->${edge.target_vid}::${edge.id || edgeTitle(edge) || ''}`;
}

function edgeTitle(edge, lang = 'en') {
  const props = edge?.properties || {};
  return props[`content_${lang}`] || props[`title_${lang}`] || props.content_en || props.title_en || edge?.id || '';
}

export function getRelatedNodes(index, characterId) {
  const groups = new Map();

  for (const item of index.relatedById.get(characterId) || []) {
    const nodeId = item.node.vid;
    let group = groups.get(nodeId);
    if (!group) {
      group = { node: item.node, relations: [], relationKeys: new Set() };
      groups.set(nodeId, group);
    }

    const key = relatedEdgeKey(item);
    if (!group.relationKeys.has(key)) {
      group.relationKeys.add(key);
      group.relations.push({ edge: item.edge });
    }
  }

  return [...groups.values()].map(({ node, relations }) => ({ node, relations }));
}

function relatedEdgeKey({ edge }) {
  const props = edge.properties || {};
  return [
    edge.source_vid,
    edge.target_vid,
    props.content_zh || props.title_zh || '',
    props.content_en || props.title_en || ''
  ].join('::');
}
