/**
 * 拓扑视图的布局与力导向模拟。
 * 纯计算：只处理节点坐标与速度，不触碰 canvas 与模块状态。
 */
import { seededPosition } from '../../core/utils.js';

export const LAYOUT_MODES = {
  CIRCLE: 'circle',
  RADIAL: 'radial',
  COLUMNS: 'columns',
  FORCE: 'force',
  SEED: 'seed'
};

const LAYOUT_PLACERS = {
  [LAYOUT_MODES.CIRCLE]: placeCircleNode,
  [LAYOUT_MODES.RADIAL]: placeRadialNode,
  [LAYOUT_MODES.COLUMNS]: placeColumnNode,
  [LAYOUT_MODES.SEED]: placeSeedNode
};

/** 按布局模式摆放节点。nodes 需已按度数从高到低排序。 */
export function layoutNodes(nodes, { mode, width, height }) {
  const centerX = width / 2;
  const centerY = height / 2;
  const place = LAYOUT_PLACERS[mode] || placeSeedNode;

  nodes.forEach((node, index) => {
    place(node, index, { nodes, count: nodes.length, centerX, centerY, width, height });
  });
}

function placeCircleNode(node, index, { count, centerX, centerY, width, height }) {
  const angle = (Math.PI * 2 * index) / Math.max(1, count);
  const radius = Math.min(width, height) * 0.38;
  node.x = centerX + Math.cos(angle) * radius;
  node.y = centerY + Math.sin(angle) * radius;
}

function placeRadialNode(node, index, { nodes, centerX, centerY, width, height }) {
  const topDegree = Math.max(1, nodes[0]?.degree.total || 1);
  const ring = 1 - (node.degree.total || 1) / topDegree;
  const angle = (Math.PI * 2 * index * 0.618) % (Math.PI * 2);
  const radius = Math.min(width, height) * (0.08 + ring * 0.38);
  node.x = centerX + Math.cos(angle) * radius;
  node.y = centerY + Math.sin(angle) * radius;
}

function placeColumnNode(node, index, { width, height }) {
  const balance = node.degree.out - node.degree.in;
  const column = balance > 3 ? 0.25 : balance < -3 ? 0.75 : 0.5;
  node.x = width * column + (seededPosition(index, node.vid).x - 0.5) * 50;
  node.y = 56 + (index % Math.max(1, Math.floor(height / 42))) * 42;
}

function placeSeedNode(node, index, { centerX, centerY, width, height }) {
  const seed = seededPosition(index, node.vid);
  const angle = Math.PI * 2 * seed.x;
  const radius = Math.min(width, height) * (0.1 + seed.y * 0.28);
  node.x = centerX + Math.cos(angle) * radius;
  node.y = centerY + Math.sin(angle) * radius;
}

/** 节点间斥力，避免相互重叠。 */
export function applyRepulsion(nodes, cooling) {
  nodes.forEach((a, i) => {
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const dx = a.x - b.x || 0.01;
      const dy = a.y - b.y || 0.01;
      const distanceSquared = dx * dx + dy * dy;
      const force = Math.min(1.8, 780 / distanceSquared) * cooling;
      const distance = Math.sqrt(distanceSquared);
      a.vx += (dx / distance) * force;
      a.vy += (dy / distance) * force;
      b.vx -= (dx / distance) * force;
      b.vy -= (dy / distance) * force;
    }
  });
}

/** 边张力，把相连节点拉近到目标距离。 */
export function applyEdgeTension(edges, nodeMap, cooling) {
  edges.forEach((edge) => {
    const source = nodeMap.get(edge.source_vid);
    const target = nodeMap.get(edge.target_vid);
    if (!source || !target) return;

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const targetDistance = 72 + Math.min(55, (source.r + target.r) * 2.2);
    const force = (distance - targetDistance) * 0.0009 * cooling;

    source.vx += dx * force;
    source.vy += dy * force;
    target.vx -= dx * force;
    target.vy -= dy * force;
  });
}

/** 应用速度、约束边界，返回本轮总能量（用于判断力导是否收敛）。 */
export function moveNodes(nodes, { width, height, cooling }) {
  const centerX = width / 2;
  const centerY = height / 2;
  let energy = 0;

  nodes.forEach((node) => {
    if (node.fixed) return;

    node.vx += (centerX - node.x) * 0.006 * cooling;
    node.vy += (centerY - node.y) * 0.006 * cooling;
    node.vx *= 0.72;
    node.vy *= 0.72;

    const speed = Math.hypot(node.vx, node.vy);
    if (speed > 5) {
      node.vx = (node.vx / speed) * 5;
      node.vy = (node.vy / speed) * 5;
    }

    node.x = Math.max(node.r + 8, Math.min(width - node.r - 8, node.x + node.vx));
    node.y = Math.max(node.r + 8, Math.min(height - node.r - 8, node.y + node.vy));
    energy += Math.abs(node.vx) + Math.abs(node.vy);
  });

  return energy;
}
