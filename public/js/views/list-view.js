import { DATA_TEXT } from '../core/state.js';
import { cssEscape, escapeHtml } from '../core/utils.js';
import { getName, getOtherName, edgeEndpoint, getRelationText } from '../systems/data/node-fields.js';
import { getRelatedNodes } from '../systems/data/network-index.js';

let gridEl = null;
let panelEl = null;
let panelTitleEl = null;
let panelContentEl = null;
let onNodeSelect = null;
let language = 'zh';
let index = null;
let panel = { hoveredId: null, pinnedId: null };
let bound = false;

export function initListView(grid, panelElements, onSelect) {
  gridEl = grid;
  panelEl = panelElements?.panel;
  panelTitleEl = panelElements?.title;
  panelContentEl = panelElements?.content;
  onNodeSelect = onSelect;

  if (bound) return;
  bound = true;

  gridEl?.addEventListener('click', onGridClick);
  gridEl?.addEventListener('keydown', onGridKeyDown);
  gridEl?.addEventListener('mouseover', onCardHover);
  gridEl?.addEventListener('mouseout', onCardLeave);
  panelEl?.addEventListener('click', onPanelClick);
  panelEl?.addEventListener('mouseleave', onPanelLeave);
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('scroll', syncFloatingPanel, { passive: true });
}

export function closeListPanel() {
  panel.hoveredId = null;
  panel.pinnedId = null;
  updatePanelVisibility(false);
}

function onGridClick(event) {
  const card = event.target.closest('[data-node-id]');
  if (!card || !onNodeSelect) return;
  onNodeSelect(card.dataset.nodeId);
}

function onGridKeyDown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('[data-node-id]');
  if (!card || !onNodeSelect) return;
  event.preventDefault();
  onNodeSelect(card.dataset.nodeId);
}

function onCardHover(event) {
  if (panel.pinnedId) return;
  const card = event.target.closest('[data-node-id]');
  if (!card) return;
  showFloatingPanel(card.dataset.nodeId);
}

function onCardLeave(event) {
  if (panel.pinnedId) return;
  const card = event.target.closest('[data-node-id]');
  if (!card) return;
  if (card.contains(event.relatedTarget)) return;
  if (event.relatedTarget?.closest?.('[data-floating-panel]')) return;
  hideFloatingPanel();
}

function onPanelClick(event) {
  const jumpButton = event.target.closest('[data-related-jump]');
  if (jumpButton) {
    openCharacterPanel(jumpButton.dataset.targetId);
    return;
  }
  if (panel.hoveredId) {
    panel.pinnedId = panel.hoveredId;
    syncFloatingPanel();
  }
}

function onPanelLeave() {
  if (panel.pinnedId) return;
  hideFloatingPanel();
}

function onDocumentClick(event) {
  if (!panel.pinnedId) return;
  if (event.target.closest('[data-floating-panel]')) return;
  closeListPanel();
}

function showFloatingPanel(nodeId) {
  panel.hoveredId = nodeId;
  syncFloatingPanel();
}

function hideFloatingPanel() {
  panel.hoveredId = null;
  updatePanelVisibility(false);
}

function openCharacterPanel(nodeId) {
  panel.hoveredId = nodeId;
  panel.pinnedId = nodeId;
  document.querySelector(`[data-node-id="${cssEscape(nodeId)}"]`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
  requestAnimationFrame(syncFloatingPanel);
}

function syncFloatingPanel() {
  const activeId = panel.pinnedId || panel.hoveredId;
  if (!activeId) {
    updatePanelVisibility(false);
    return;
  }

  const anchor = document.querySelector(`[data-node-id="${cssEscape(activeId)}"]`);
  if (!anchor) {
    updatePanelVisibility(false);
    return;
  }

  if (panelTitleEl) panelTitleEl.textContent = DATA_TEXT.relatedTitle;
  if (panelContentEl) panelContentEl.innerHTML = renderRelatedList(activeId);
  updatePanelVisibility(true);
  panelEl?.classList.toggle('is-pinned', panel.pinnedId === activeId);
  positionFloatingPanel(anchor, panelEl);
}

function renderRelatedList(nodeId) {
  const relatedList = getRelatedNodes(index || { relatedById: new Map() }, nodeId);
  if (!relatedList.length) {
    return `<div class="related-empty">${escapeHtml(DATA_TEXT.noRelated)}</div>`;
  }

  return `
    <div class="related-list">
      ${relatedList.map(renderRelatedItem).join('')}
    </div>
  `;
}

function renderRelatedItem({ node, relations }) {
  const fallback = `ID: ${node.vid}`;
  return `
    <button class="related-item" type="button" data-related-jump data-target-id="${escapeHtml(node.vid)}">
      <strong>${escapeHtml(getName(node, language))}</strong>
      <span class="related-relations">
        ${relations.map(({ edge }) => renderRelation(edge, fallback)).join('')}
      </span>
    </button>
  `;
}

function renderRelation(edge, fallback) {
  const source = edgeEndpoint(edge, 'source', language);
  const target = edgeEndpoint(edge, 'target', language);
  return `
    <span class="related-relation">
      <small>${escapeHtml(source)} → ${escapeHtml(target)}</small>
      ${escapeHtml(getRelationText(edge, language) || fallback)}
    </span>
  `;
}

function positionFloatingPanel(anchor, panelNode) {
  if (!panelNode) return;
  const anchorRect = anchor.getBoundingClientRect();
  const panelRect = panelNode.getBoundingClientRect();
  const gap = 12;
  const margin = 16;
  let left = anchorRect.right + gap;
  let top = anchorRect.top;

  if (left + panelRect.width > window.innerWidth - margin) {
    left = anchorRect.left - panelRect.width - gap;
  }
  if (left < margin) {
    left = Math.max(margin, window.innerWidth - panelRect.width - margin);
  }
  if (top + panelRect.height > window.innerHeight - margin) {
    top = window.innerHeight - panelRect.height - margin;
  }
  if (top < margin) {
    top = margin;
  }

  panelNode.style.left = `${left}px`;
  panelNode.style.top = `${top}px`;
}

function updatePanelVisibility(visible) {
  panelEl?.classList.toggle('is-open', visible);
  if (!visible) {
    panelEl?.classList.remove('is-pinned');
  }
}

export function renderList(nodes, options) {
  if (!gridEl) return;

  language = options.language;
  index = options.index;

  if (!nodes.length) {
    closeListPanel();
    gridEl.innerHTML = `<div class="empty">${escapeHtml(DATA_TEXT.empty)}</div>`;
    return;
  }

  const semanticScores = options.semanticScores;
  const scoreValues = semanticScores
    ? nodes.map((node) => semanticScores.get(node.vid)).filter(Number.isFinite)
    : [];
  const scoreRange = scoreValues.length
    ? { min: Math.min(...scoreValues), max: Math.max(...scoreValues) }
    : null;

  gridEl.innerHTML = nodes
    .map((node) => renderCard(node, language, index, semanticScores?.get(node.vid), scoreRange))
    .join('');

  if (panel.pinnedId || panel.hoveredId) {
    syncFloatingPanel();
  }
}

function renderCard(node, lang, dataIndex, semanticScore, scoreRange) {
  const image = node.properties.photo || '';
  const degree = dataIndex.degreeById.get(node.vid)?.total || 0;
  return `
    <article class="node-card" data-node-id="${escapeHtml(node.vid)}" role="button" tabindex="0">
      <div class="portrait">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(getName(node, lang))}" loading="lazy">` : ''}</div>
      <div class="card-body">
        <h3>${escapeHtml(getName(node, lang))}</h3>
        <p>${escapeHtml(getOtherName(node, lang))}</p>
        <div class="chips">
          <span class="chip">ID: ${escapeHtml(node.vid)}</span>
          <span class="chip">连接 ${degree}</span>
        </div>
        ${renderSemanticScore(semanticScore, scoreRange)}
      </div>
    </article>
  `;
}

function renderSemanticScore(score, range) {
  if (!Number.isFinite(score) || !range) return '';
  const spread = range.max - range.min;
  const relative = spread > 0 ? (score - range.min) / spread : 1;
  const width = Math.round(18 + relative * 82);
  return `
    <div class="semantic-score" title="综合排序分数，数值越高表示与搜索文本越相关">
      <div class="semantic-score-head">
        <span>综合相关分数</span>
        <strong>${escapeHtml(score.toFixed(3))}</strong>
      </div>
      <div class="semantic-score-track" aria-hidden="true">
        <i style="width:${width}%"></i>
      </div>
    </div>
  `;
}

export function matchesQuery(node, query) {
  if (!query) return true;
  const haystack = [node.vid, node.properties.name_zh, node.properties.name_en].join(' ').toLowerCase();
  return haystack.includes(query);
}
