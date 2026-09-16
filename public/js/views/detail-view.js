import { api } from '../core/api.js';
import { DETAIL_SOURCE_VIEWS, DISPLAY_TYPES, LANGUAGES } from '../core/constants.js';
import { DATA_TEXT, state } from '../core/state.js';
import { escapeHtml } from '../core/utils.js';
import { navigateToDetail, navigateToStory } from '../core/router.js';
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
import { resolveProfile, getHeroTexts, getStoryConfig } from '../systems/data/business-profile.js';
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
    return;
  }
}

function onChange(event) {
  const voiceSelect = event.target.closest('[data-voice-lang-select]');
  if (voiceSelect) {
    setVoiceLanguage(voiceSelect.value);
    if (state.detail.nodeId) renderDetail(state.detail.nodeId);
    return;
  }
  const sectionSelect = event.target.closest('[data-section-select]');
  if (sectionSelect) {
    const value = sectionSelect.value;
    container.querySelectorAll('.detail-block').forEach((block) => {
      block.hidden = !(value === '__all__' || block.dataset.section === value);
    });
  }
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
  const storyConfig = getStoryConfig(state.dataSource);

  container.innerHTML = `
    <div class="detail-page" data-business="${escapeHtml(state.dataSource)}">
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
        ${renderSections(profile, data, lang)}
        ${renderRelated(related, lang, profile)}
        ${storyConfig ? `<section class="detail-section" data-story-anchor><h2>${escapeHtml(storyConfig.title)}</h2><div class="detail-muted">加载中…</div></section>` : ''}
      </div>
    </div>
  `;

  if (storyConfig) {
    loadRelatedStories(container, data, lang, storyConfig);
  }
}

function pickHeroImage(profile, data, node, lang) {
  const config = profile.heroImage;
  if (config?.source === 'pngs') {
    return upgradeImageUrl(pickImageUrl(data?.pngs?.[0])) || node?.properties?.photo || '';
  }
  if (config?.source === 'localized' && config.field) {
    return upgradeImageUrl(pickLocalized(data, config.field, lang)) || node?.properties?.photo || '';
  }
  if (config?.source === 'avatars') {
    const url = data?.avatars?.[0]?.url || node?.properties?.photo || '';
    return upgradeImageUrl(url);
  }
  return upgradeImageUrl(node?.properties?.photo || '');
}

function renderLine(text, className = '') {
  if (!text) return '';
  return `<p class="${className}">${escapeHtml(text)}</p>`;
}

function renderSections(profile, data, lang) {
  if (!profile?.sections?.length) return '';
  const blocks = profile.sections
    .map((section) => {
      const html = renderSection(section, data, lang);
      if (!html) return '';
      return `<div class="detail-block" data-section="${escapeHtml(section.title)}">${html}</div>`;
    })
    .filter(Boolean);
  if (!blocks.length) return '';
  const nav = profile.sectionNav
    ? `<div class="detail-section-nav"><label class="detail-section-label">查看：</label><select class="detail-section-select" data-section-select>
        <option value="__all__">全部</option>
        ${profile.sections.map((s) => `<option value="${escapeHtml(s.title)}">${escapeHtml(s.title)}</option>`).join('')}
      </select></div>`
    : '';
  return `${nav}${blocks.join('')}`;
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

/**
 * 剧情模块入口：按角色名关联该业务独立的剧情表（接口按业务泛化，非某业务专属）。
 * 后端接口尚未提供时优雅降级为提示，不影响角色详情本身渲染。
 */
async function loadRelatedStories(container, data, lang, storyConfig) {
  const anchor = container.querySelector('[data-story-anchor]');
  if (!anchor) return;
  const name = pickLocalized(data, 'name', lang);
  if (!name) {
    anchor.innerHTML = '<p class="detail-muted">暂无剧情关联</p>';
    return;
  }
  try {
    const res = await api(`/api/stories/${encodeURIComponent(state.dataSource)}?character=${encodeURIComponent(name)}`);
    const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
    if (!list.length) {
      anchor.innerHTML = '<p class="detail-muted">该角色暂无关联剧情。</p>';
      return;
    }
    anchor.innerHTML = `
      <h2>${escapeHtml(storyConfig.title)}</h2>
      <div class="detail-related-grid">
        ${list.map((s) => {
          const key = escapeHtml(s.key || '');
          const title = escapeHtml(pickLocalized(s, storyConfig.fields.title, lang) || key);
          return `<button class="detail-related-card" type="button" data-story-key="${key}"><div><strong>${title}</strong></div></button>`;
        }).join('')}
      </div>`;
    anchor.querySelectorAll('[data-story-key]').forEach((el) => {
      el.addEventListener('click', () => navigateToStory(el.dataset.storyKey));
    });
  } catch (e) {
    anchor.innerHTML = '<p class="detail-muted">剧情数据接口尚未接入。</p>';
  }
}
