import { DATA_TEXT } from '../core/state.js';
import {
  clamp,
  escapeHtml,
  formatText,
  getCssColor,
  intersectSets,
  pointToSegmentDistance,
  seededPosition
} from '../core/utils.js';
import { edgeKey } from '../systems/data/network-index.js';
import { buildFocusSelection, buildPathSelection } from './graph/selectors.js';
import { LAYOUT_MODES, applyEdgeTension, applyRepulsion, layoutNodes, moveNodes } from './graph/layout.js';
import {
  edgeEndpoint,
  getName,
  getRelationText
} from '../systems/data/node-fields.js';

/* ---------- 运行时状态 ---------- */
const graph = {
  nodes: [],
  edges: [],
  nodeMap: new Map(),
  hoverNode: null,
  hoverEdge: null,
  draggingNode: null,
  panning: false,
  dragMoved: false,
  running: true,
  cooling: 0,
  imageCache: new Map(),
  viewport: {
    scale: 1,
    minScale: 0.45,
    maxScale: 2.8,
    offsetX: 0,
    offsetY: 0,
    dragStartX: 0,
    dragStartY: 0,
    startOffsetX: 0,
    startOffsetY: 0
  }
};

const view = {
  focus: { active: false, nodeIds: new Set() },
  path: { active: false, found: false, nodeIds: new Set(), edgeKeys: new Set(), steps: 0 }
};

let canvas = null;
let tooltip = null;
let ctx = null;
let runtime = null;
let onNodeSelect = null;
let eventsBound = false;
let animating = false;

function themeRoot() {
  return document.querySelector('[data-theme-scope="data"]') || document.documentElement;
}

/* ---------- 对外接口 ---------- */
export function initGraphView(canvasEl, tooltipEl, onSelect) {
  canvas = canvasEl;
  tooltip = tooltipEl;
  onNodeSelect = onSelect;
  if (!eventsBound) {
    bindCanvasEvents();
    eventsBound = true;
  }
}

export function renderGraph(input) {
  runtime = input;
  buildViewFilters();
  const visibleNodeIds = buildVisibleNodeIds();
  const visibleEdgeKeys = view.path.active ? view.path.edgeKeys : null;

  graph.nodes = buildGraphNodes(visibleNodeIds);
  graph.nodeMap = new Map(graph.nodes.map((node) => [node.vid, node]));
  graph.edges = buildGraphEdges(visibleEdgeKeys);

  applyLayout(true);
  if (!animating) {
    animating = true;
    requestAnimationFrame(animationLoop);
  }

  return { nodes: graph.nodes, edges: graph.edges };
}

/* ---------- 图数据构建 ---------- */
function buildViewFilters() {
  view.focus = buildFocusSelection(runtime);
  view.path = buildPathSelection(runtime);
}

function buildVisibleNodeIds() {
  let nodeIds = new Set((runtime.data.nodes || []).map((node) => node.vid));
  if (view.focus.active) nodeIds = intersectSets(nodeIds, view.focus.nodeIds);
  if (view.path.active) nodeIds = intersectSets(nodeIds, view.path.nodeIds);
  return nodeIds;
}

function buildGraphNodes(visibleNodeIds) {
  const { data, filters, index, language } = runtime;
  return (data.nodes || [])
    .filter((node) => visibleNodeIds.has(node.vid))
    .map((node, indexNum) => {
      const seed = seededPosition(indexNum, node.vid);
      const degree = index.degreeById.get(node.vid) || { in: 0, out: 0, total: 0 };
      const radius = filters.sizeMode === 'uniform' ? 18 : Math.max(16, Math.min(34, 14 + Math.sqrt(degree.total) * 2.4));
      const graphNode = {
        ...node,
        x: seed.x * Math.max(1, canvas?.clientWidth || 800),
        y: seed.y * Math.max(1, canvas?.clientHeight || 600),
        vx: 0,
        vy: 0,
        r: radius,
        degree,
        isFocusCenter: node.vid === filters.focusNodeId,
        isPathNode: view.path.nodeIds.has(node.vid)
      };
      preloadNodeImage(graphNode, language);
      return graphNode;
    });
}

function buildGraphEdges(visibleEdgeKeys) {
  return (runtime.data.edges || [])
    .filter((edge) => graph.nodeMap.has(edge.source_vid) && graph.nodeMap.has(edge.target_vid))
    .filter((edge) => !visibleEdgeKeys || visibleEdgeKeys.has(edgeKey(edge)))
    .map((edge) => ({ ...edge, isPath: view.path.edgeKeys.has(edgeKey(edge)) }));
}

/* ---------- 布局与力导 ---------- */
function applyLayout(resetVelocity) {
  if (!canvas) return;

  const nodes = [...graph.nodes].sort((a, b) => b.degree.total - a.degree.total);
  const mode = runtime.filters.layout;

  if (resetVelocity) nodes.forEach((node) => { node.vx = 0; node.vy = 0; });
  layoutNodes(nodes, { mode, width: canvas.clientWidth, height: canvas.clientHeight });

  graph.running = true;
  graph.cooling = mode === LAYOUT_MODES.FORCE ? 1 : 0;
  drawGraph();
}

function animationLoop() {
  if (runtime?.active && runtime.filters.layout === LAYOUT_MODES.FORCE && graph.running) {
    simulateForceLayout();
  }
  if (runtime?.active) drawGraph();
  requestAnimationFrame(animationLoop);
}

function simulateForceLayout() {
  if (!canvas) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  for (let i = 0; i < 2; i++) {
    applyRepulsion(graph.nodes, graph.cooling);
    applyEdgeTension(graph.edges, graph.nodeMap, graph.cooling);

    const energy = moveNodes(graph.nodes, { width, height, cooling: graph.cooling });
    graph.cooling *= 0.985;
    if (graph.cooling < 0.035 || energy < 0.08) {
      graph.running = false;
      break;
    }
  }
}

/* ---------- Canvas 绘制 ---------- */
function drawGraph() {
  if (!canvas) return;

  ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.save();
  ctx.translate(graph.viewport.offsetX, graph.viewport.offsetY);
  ctx.scale(graph.viewport.scale, graph.viewport.scale);
  graph.edges.forEach((edge) => drawEdge(edge));
  graph.nodes.forEach((node) => drawNode(node));
  ctx.restore();
}

function drawEdge(edge) {
  const source = graph.nodeMap.get(edge.source_vid);
  const target = graph.nodeMap.get(edge.target_vid);
  if (!source || !target) return;

  const points = edgeLine(source, target);
  const active = edge.isPath || edge === graph.hoverEdge || source === graph.hoverNode || target === graph.hoverNode;
  const color = edge.isPath ? 'rgba(200, 138, 40, 0.92)' : active ? 'rgba(200, 138, 40, 0.82)' : getCssColor('--line', 0.72, themeRoot());

  ctx.strokeStyle = color;
  ctx.lineWidth = edge.isPath ? 2.4 : active ? 1.8 : 1;
  ctx.beginPath();
  ctx.moveTo(points.startX, points.startY);
  ctx.lineTo(points.endX, points.endY);
  ctx.stroke();
  drawArrow(points.endX, points.endY, points.ux, points.uy, color, edge.isPath ? 8 : 6);
}

function edgeLine(source, target) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;
  return {
    startX: source.x + ux * (source.r + 4),
    startY: source.y + uy * (source.r + 4),
    endX: target.x - ux * (target.r + 8),
    endY: target.y - uy * (target.r + 8),
    ux,
    uy
  };
}

function drawArrow(x, y, ux, uy, color, size) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - ux * size - uy * size * 0.7, y - uy * size + ux * size * 0.7);
  ctx.lineTo(x - ux * size + uy * size * 0.7, y - uy * size - ux * size * 0.7);
  ctx.closePath();
  ctx.fill();
}

function drawNode(node) {
  const active = node === graph.hoverNode || node.isFocusCenter || node.isPathNode;
  ctx.beginPath();
  ctx.arc(node.x, node.y, node.r + (active ? 7 : 4), 0, Math.PI * 2);
  ctx.fillStyle = node.isPathNode
    ? 'rgba(200, 138, 40, 0.28)'
    : node.isFocusCenter
      ? 'rgba(35, 122, 111, 0.28)'
      : active
        ? 'rgba(200, 138, 40, 0.22)'
        : 'rgba(35, 122, 111, 0.16)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
  drawNodeBody(node);
  ctx.strokeStyle = active || node.isPathNode ? getCssColor('--accent-2', null, themeRoot()) : getCssColor('--panel-strong', null, themeRoot());
  ctx.lineWidth = active || node.isPathNode ? 3 : 2;
  ctx.stroke();
}

function drawNodeBody(node) {
  const image = graph.imageCache.get(node.properties.photo || '');
  if (image?.ready) {
    ctx.save();
    ctx.clip();
    const size = node.r * 2;
    ctx.fillStyle = getCssColor('--panel-strong', null, themeRoot());
    ctx.fillRect(node.x - node.r, node.y - node.r, size, size);
    ctx.drawImage(image.element, node.x - node.r, node.y - node.r, size, size);
    ctx.restore();
    return;
  }

  const gradient = ctx.createRadialGradient(node.x - node.r * 0.35, node.y - node.r * 0.35, 1, node.x, node.y, node.r);
  gradient.addColorStop(0, getCssColor('--accent-2', null, themeRoot()));
  gradient.addColorStop(1, getCssColor('--accent', null, themeRoot()));
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.font = `700 ${Math.max(12, node.r * 0.75)}px Segoe UI, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(getName(node, runtime.language) || node.vid).slice(0, 1).toUpperCase(), node.x, node.y + 1);
  ctx.restore();
}

function preloadNodeImage(node) {
  const url = node.properties.photo;
  if (!url || graph.imageCache.has(url)) return;
  const entry = { ready: false, element: new Image() };
  entry.element.crossOrigin = 'anonymous';
  entry.element.onload = () => {
    entry.ready = true;
    drawGraph();
  };
  entry.element.onerror = () => drawGraph();
  entry.element.src = url;
  graph.imageCache.set(url, entry);
}

/* ---------- 交互事件 ---------- */
function bindCanvasEvents() {
  if (!canvas) return;

  canvas.addEventListener('pointerdown', onCanvasPointerDown);
  canvas.addEventListener('pointermove', onCanvasPointerMove);
  canvas.addEventListener('pointerup', onCanvasPointerUp);
  canvas.addEventListener('pointerleave', onCanvasPointerUp);
  canvas.addEventListener('pointerleave', hideTooltip);
  canvas.addEventListener('wheel', onCanvasWheel, { passive: false });

  window.addEventListener('resize', () => {
    if (runtime?.active) applyLayout(false);
  });
}

function onCanvasPointerDown(event) {
  graph.dragMoved = false;
  const point = eventPoint(event);
  const clickedNode = findNodeAt(point.x, point.y);
  graph.draggingNode = clickedNode;

  if (graph.draggingNode) {
    graph.draggingNode.fixed = true;
    graph.running = false;
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  graph.panning = true;
  graph.viewport.dragStartX = event.clientX;
  graph.viewport.dragStartY = event.clientY;
  graph.viewport.startOffsetX = graph.viewport.offsetX;
  graph.viewport.startOffsetY = graph.viewport.offsetY;
  canvas.setPointerCapture(event.pointerId);
}

function onCanvasPointerMove(event) {
  const point = eventPoint(event);

  if (graph.draggingNode) {
    graph.dragMoved = true;
    graph.draggingNode.x = point.x;
    graph.draggingNode.y = point.y;
    graph.draggingNode.vx = 0;
    graph.draggingNode.vy = 0;
    showNodeTooltip(graph.draggingNode, event);
    return;
  }

  if (graph.panning) {
    graph.dragMoved = true;
    graph.viewport.offsetX = graph.viewport.startOffsetX + (event.clientX - graph.viewport.dragStartX);
    graph.viewport.offsetY = graph.viewport.startOffsetY + (event.clientY - graph.viewport.dragStartY);
    hideTooltip();
    drawGraph();
    return;
  }

  graph.hoverNode = findNodeAt(point.x, point.y);
  graph.hoverEdge = graph.hoverNode ? null : findEdgeAt(point.x, point.y);

  if (graph.hoverNode) showNodeTooltip(graph.hoverNode, event);
  else if (graph.hoverEdge) showEdgeTooltip(graph.hoverEdge, event);
  else hideTooltip();
}

function onCanvasPointerUp(event) {
  const clicked = graph.draggingNode;
  if (clicked) {
    clicked.fixed = false;
    if (!graph.dragMoved && onNodeSelect) onNodeSelect(clicked.vid);
    graph.draggingNode = null;
  }
  graph.panning = false;
  canvas.releasePointerCapture(event.pointerId);
}

function onCanvasWheel(event) {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const cursorX = event.clientX - rect.left;
  const cursorY = event.clientY - rect.top;
  const before = screenToWorld(cursorX, cursorY);
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  const nextScale = clamp(graph.viewport.scale * factor, graph.viewport.minScale, graph.viewport.maxScale);
  if (nextScale === graph.viewport.scale) return;

  graph.viewport.scale = nextScale;
  graph.viewport.offsetX = cursorX - before.x * graph.viewport.scale;
  graph.viewport.offsetY = cursorY - before.y * graph.viewport.scale;
  drawGraph();
}

function findNodeAt(x, y) {
  for (let i = graph.nodes.length - 1; i >= 0; i--) {
    const node = graph.nodes[i];
    if (Math.hypot(x - node.x, y - node.y) <= node.r + 5) return node;
  }
  return null;
}

function findEdgeAt(x, y) {
  let best = null;
  let bestDistance = 7;

  graph.edges.forEach((edge) => {
    const source = graph.nodeMap.get(edge.source_vid);
    const target = graph.nodeMap.get(edge.target_vid);
    if (!source || !target) return;
    const points = edgeLine(source, target);
    const distance = pointToSegmentDistance(x, y, points.startX, points.startY, points.endX, points.endY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = edge;
    }
  });

  return best;
}

function showNodeTooltip(node, event) {
  if (!tooltip) return;

  tooltip.innerHTML = `
    ${node.properties.photo ? `<img src="${escapeHtml(node.properties.photo)}" alt="">` : ''}
    <h3>${escapeHtml(getName(node, runtime.language))}</h3>
    <p>ID: ${escapeHtml(node.vid)}</p>
    <div class="chips">
      <span class="chip">${DATA_TEXT.inDegree} ${node.degree.in}</span>
      <span class="chip">${DATA_TEXT.outDegree} ${node.degree.out}</span>
      <span class="chip">${DATA_TEXT.totalDegree} ${node.degree.total}</span>
    </div>
  `;
  moveTooltip(event);
}

function showEdgeTooltip(edge, event) {
  if (!tooltip) return;

  const source = edgeEndpoint(edge, 'source', runtime.language);
  const target = edgeEndpoint(edge, 'target', runtime.language);

  tooltip.innerHTML = `
    <h3>${escapeHtml(formatText(DATA_TEXT.relationTitle, { source, target }))}</h3>
    <p>${escapeHtml(getRelationText(edge, runtime.language))}</p>
    <div class="chips">
      <span class="chip">${escapeHtml(edge.source_vid)}</span>
      <span class="chip">${DATA_TEXT.relationLabel}</span>
      <span class="chip">${escapeHtml(edge.target_vid)}</span>
    </div>
  `;
  moveTooltip(event);
}

function moveTooltip(event) {
  if (!tooltip) return;
  tooltip.classList.add('visible');
  const x = Math.min(window.innerWidth - 320, event.clientX + 14);
  const y = Math.min(window.innerHeight - 180, event.clientY + 14);
  tooltip.style.left = `${Math.max(10, x)}px`;
  tooltip.style.top = `${Math.max(10, y)}px`;
}

function hideTooltip() {
  graph.hoverNode = null;
  graph.hoverEdge = null;
  tooltip?.classList.remove('visible');
}

function eventPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
}

function screenToWorld(x, y) {
  return {
    x: (x - graph.viewport.offsetX) / graph.viewport.scale,
    y: (y - graph.viewport.offsetY) / graph.viewport.scale
  };
}

export function setGraphActive(active) {
  if (runtime) runtime.active = active;
}

export function refreshGraphLayout() {
  if (runtime?.active) applyLayout(true);
}
