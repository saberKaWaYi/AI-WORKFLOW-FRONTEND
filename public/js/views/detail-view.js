import { api } from '../core/api.js';
import { DETAIL_SOURCE_VIEWS, DISPLAY_TYPES, LANGUAGES } from '../core/constants.js';
import { DATA_TEXT, state } from '../core/state.js';
import { escapeHtml } from '../core/utils.js';
import { navigateToDetail } from '../core/router.js';
import {
  edgeEndpoint,
  getName,
  getOtherName,
  getRelationText,
  otherLanguage,
  pickImageUrl,
  pickLocalized,
  upgradeImageUrl
} from '../systems/data/node-fields.js';
import { resolveProfile, getHeroTexts } from '../systems/data/business-profile.js';
import { getRelatedNodes } from '../systems/data/network-index.js';
import { renderMetaSection, renderSection, setVoiceLanguage } from './detail/sections.js';

let container = null;
let onBack = null;
let dataShell = null;
let detailIndex = null;
let voiceNodeId = '';
let detailRequestSeq = 0;

export function initDetailView(root, backHandler) {
  container = root;
  onBack = backHandler;
  dataShell = document.querySelector('[data-shell="data"]');
  container?.addEventListener('click', onClick);
  container?.addEventListener('change', onChange);
}

function onClick(event) {
  if (event.target.closest('[data-detail-back]')) {
    onBack?.();
    return;
  }
  const related = event.target.closest('[data-related-id]');
  if (related) {
    event.preventDefault();
    event.stopPropagation();
    navigateToDetail(related.dataset.relatedId, state.detail.sourceView || DETAIL_SOURCE_VIEWS.CARDS);
  }
}

function onChange(event) {
  const select = event.target.closest('[data-voice-lang-select]');
  if (!select) return;
  setVoiceLanguage(select.value);
  if (state.detail.nodeId) renderDetail(state.detail.nodeId);
}

export async function showDetail(nodeId, { index, sourceView = DETAIL_SOURCE_VIEWS.CARDS, onReady }) {
  state.detail.nodeId = nodeId;
  state.detail.sourceView = sourceView;
  detailIndex = index;
  if (voiceNodeId !== nodeId) {
    setVoiceLanguage('');
    voiceNodeId = nodeId;
  }
  detailRequestSeq += 1;
  const requestSeq = detailRequestSeq;
  dataShell?.classList.remove('sidebar-collapsed');
  dataShell?.classList.add('detail-mode');
  container?.classList.remove('is-hidden');
  await loadDetail(nodeId, requestSeq);
  onReady?.();
}

export function hideDetail() {
  container?.classList.add('is-hidden');
  state.detail.data = null;
  state.detail.nodeId = '';
  state.detail.sourceView = '';
  setVoiceLanguage('');
  voiceNodeId = '';
  detailRequestSeq += 1;
  dataShell?.classList.remove('detail-mode');
}

async function loadDetail(nodeId, requestSeq) {
  if (!container) return;
  state.detail.loading = true;
  renderLoading(nodeId);

  const params = new URLSearchParams({ business_name: state.dataSource, name: nodeId });
  const result = await api(`/api/nodes?${params}`);
  if (requestSeq !== detailRequestSeq) return;
  state.detail.data = result.data;
  state.detail.loading = false;
  renderDetail(nodeId);
}

function renderLoading(nodeId) {
  container.innerHTML = `
    <div class="detail-page">
      <header class="detail-header">
        <button class="ghost-btn detail-back" type="button" data-detail-back>${escapeHtml(DATA_TEXT.back)}</button>
        <p class="detail-breadcrumb">${escapeHtml(state.dataSource)} / ${escapeHtml(labelSource(state.detail.sourceView))} / ${escapeHtml(nodeId)}</p>
      </header>
      <div class="detail-skeleton">${escapeHtml(DATA_TEXT.detailLoading)}</div>
    </div>
  `;
}

function renderDetail(nodeId) {
  const data = state.detail.data || {};
  const lang = state.dataLanguage || LANGUAGES.ZH;
  const profile = resolveProfile(state.dataSource, data);
  const node = state.data.nodes?.find((item) => item.vid === nodeId);
  const namePrimary = pickLocalized(data, 'name', lang) || getName(node, lang) || nodeId;
  const nameSecondary = getOtherName(node, lang) || pickLocalized(data, 'name', otherLanguage(lang));
  const portrait = pickHeroImage(profile, data, node, lang);
  const heroTexts = getHeroTexts(profile, data, lang);
  const related = getRelatedNodes(detailIndex || { relatedById: new Map() }, nodeId);

  container.innerHTML = `
    <div class="detail-page">
      <header class="detail-header">
        <button class="ghost-btn detail-back" type="button" data-detail-back>${escapeHtml(DATA_TEXT.back)}</button>
        <p class="detail-breadcrumb">${escapeHtml(state.dataSource)} / ${escapeHtml(labelSource(state.detail.sourceView))} / ${escapeHtml(namePrimary)}</p>
      </header>

      <section class="detail-hero">
        <div class="detail-portrait">${portrait ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(namePrimary)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</div>
        <div class="detail-hero-text">
          <h1>${escapeHtml(namePrimary)}</h1>
          ${nameSecondary ? `<p class="detail-subname">${escapeHtml(nameSecondary)}</p>` : ''}
          ${heroTexts.map((text) => renderLine(text)).join('')}
        </div>
      </section>

      <div class="detail-body">
        ${renderMetaSection(profile, data, lang)}
        ${profile.sections.map((section) => renderSection(section, data, lang)).join('')}
        ${renderRelated(related, lang, profile)}
      </div>
    </div>
  `;
}

function pickHeroImage(profile, data, node, lang) {
  const config = profile.heroImage;
  if (config?.source === 'pngs') {
    return upgradeImageUrl(pickImageUrl(data?.pngs?.[0])) || node?.properties?.photo || '';
  }
  if (config?.source === 'localized' && config.field) {
    return upgradeImageUrl(pickLocalized(data, config.field, lang)) || node?.properties?.photo || '';
  }
  return upgradeImageUrl(node?.properties?.photo || '');
}

function renderLine(text, className = '') {
  if (!text) return '';
  return `<p class="${className}">${escapeHtml(text)}</p>`;
}

function renderRelated(related, lang, profile) {
  const title = profile?.relatedTitle || DATA_TEXT.relatedTitle;
  const noRelated = profile?.noRelated || DATA_TEXT.noRelated;

  if (!related.length) {
    return `
      <section class="detail-section">
        <h2>${escapeHtml(title)}</h2>
        <p class="detail-muted">${escapeHtml(noRelated)}</p>
      </section>
    `;
  }
  return `
    <section class="detail-section">
      <h2>${escapeHtml(title)}</h2>
      <div class="detail-related-grid">
        ${related.map(({ node, relations }) => {
          const label = getName(node, lang);
          const image = upgradeImageUrl(node.properties.photo || '');
          return `
            <button class="detail-related-card" type="button" data-related-id="${escapeHtml(node.vid)}" aria-label="${escapeHtml(label)}">
              <div class="detail-related-portrait">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</div>
              <div>
                <strong>${escapeHtml(label)}</strong>
                <div class="detail-related-relations">
                  ${relations.map(({ edge }) => renderRelatedRelation(edge, lang, node.vid)).join('')}
                </div>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderRelatedRelation(edge, lang, fallback) {
  const source = edgeEndpoint(edge, 'source', lang);
  const target = edgeEndpoint(edge, 'target', lang);
  return `
    <span class="detail-related-relation">
      <small>${escapeHtml(source)} → ${escapeHtml(target)}</small>
      ${escapeHtml(getRelationText(edge, lang) || fallback)}
    </span>
  `;
}

function labelSource(sourceView) {
  return sourceView === DISPLAY_TYPES.GRAPH ? '拓扑展示' : '列表展示';
}
