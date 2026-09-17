import { api } from '../core/api.js';
import { DETAIL_SOURCE_VIEWS, DISPLAY_TYPES, LANGUAGES } from '../core/constants.js';
import { DATA_TEXT, state } from '../core/state.js';
import { escapeHtml } from '../core/utils.js';
import { navigateToDetail, navigateToStory } from '../core/router.js';
import {
  edgeEndpoint,
  getName,
  getRelationText,
  otherLanguage,
  pickImageUrl,
  pickLocalized,
  upgradeImageUrl
} from '../systems/data/node-fields.js';
import {
  requireProfile,
  checkMongoContract,
  getHeroTexts,
  getStoryConfig
} from '../systems/data/business-profile.js';
import { logViolations, renderContractErrors } from '../systems/data/contract.js';
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
  let result;
  try {
    result = await api(`/api/nodes?${params}`);
  } catch (error) {
    if (requestSeq !== detailRequestSeq) return;
    state.detail.loading = false;
    renderError(nodeId, `详情接口请求失败：${error?.message || error}`);
    return;
  }
  if (requestSeq !== detailRequestSeq) return;
  state.detail.data = result?.data ?? null;
  state.detail.loading = false;

  try {
    renderDetail(nodeId);
  } catch (error) {
    renderError(nodeId, error?.message || String(error));
    console.error(error);
  }
}

/** 致命错误：无法继续渲染时整页报错，不做"能显示多少算多少"。 */
function renderError(nodeId, message) {
  container.innerHTML = `
    <div class="detail-page">
      <header class="detail-header">
        <button class="ghost-btn detail-back" type="button" data-detail-back>${escapeHtml(DATA_TEXT.back)}</button>
        <p class="detail-breadcrumb">${escapeHtml(state.dataSource)} / ${escapeHtml(nodeId)}</p>
      </header>
      <div class="detail-error">
        <strong>无法渲染该条目</strong>
        <p>${escapeHtml(message)}</p>
      </div>
    </div>
  `;
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
  // 业务没注册就抛错，前端不猜字段结构
  const profile = requireProfile(state.dataSource);
  const violations = checkMongoContract(profile, data, lang);
  logViolations(violations, `mongo 文档 ${data.key || nodeId}`);
  const errorsHtml = renderContractErrors(violations, `mongo 文档 ${data.key || nodeId}`);

  const namePrimary = pickLocalized(data, 'name', lang);
  const nameSecondary = pickLocalized(data, 'name', otherLanguage(lang));
  const portrait = pickHeroImage(profile, data, lang);
  const heroTexts = getHeroTexts(profile, data, lang);
  const related = getRelatedNodes(detailIndex || { relatedById: new Map() }, nodeId, lang);
  const storyConfig = getStoryConfig(state.dataSource);

  container.innerHTML = `
    <div class="detail-page" data-business="${escapeHtml(state.dataSource)}">
      ${errorsHtml}
      <header class="detail-header">
        <button class="ghost-btn detail-back" type="button" data-detail-back>${escapeHtml(DATA_TEXT.back)}</button>
        <p class="detail-breadcrumb">${escapeHtml(state.dataSource)} / ${escapeHtml(labelSource(state.detail.sourceView))} / ${escapeHtml(namePrimary || nodeId)}</p>
      </header>

      <section class="detail-hero">
        <div class="detail-portrait">${portrait ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(namePrimary)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</div>
        <div class="detail-hero-text">
          <h1>${escapeHtml(namePrimary || nodeId)}</h1>
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

/**
 * 头图只有一个来源，由 profile.heroImage 声明：
 * `{ source: 'localized', field }` 读本地化块，其余 source 即字段名读数组首项。
 * 没有声明（如后室这类纯文本站）就是不显示，不再拿 nebula 的 photo 顶上。
 */
function pickHeroImage(profile, data, lang) {
  const config = profile.heroImage;
  if (!config?.source) return '';
  if (config.source === 'localized') {
    if (!config.field) throw new Error('heroImage.source 为 localized 时必须声明 field');
    return upgradeImageUrl(pickLocalized(data, config.field, lang));
  }
  return upgradeImageUrl(pickImageUrl(data?.[config.source]?.[0], config.imageField));
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
  const title = profile.relatedTitle;
  const noRelated = profile.noRelated;

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
                  ${relations.map(({ edge }) => renderRelatedRelation(edge, lang)).join('')}
                </div>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderRelatedRelation(edge, lang) {
  const source = edgeEndpoint(edge, 'source', lang);
  const target = edgeEndpoint(edge, 'target', lang);
  return `
    <span class="detail-related-relation">
      <small>${escapeHtml(source)} → ${escapeHtml(target)}</small>
      ${escapeHtml(getRelationText(edge, lang))}
    </span>
  `;
}

function labelSource(sourceView) {
  return sourceView === DISPLAY_TYPES.GRAPH ? '拓扑展示' : '列表展示';
}

/**
 * 剧情模块入口：按角色名关联该业务独立的剧情表（接口按业务泛化，非某业务专属）。
 * 接口失败就是失败，明确报错，不用"尚未接入"把问题糊过去。
 */
async function loadRelatedStories(container, data, lang, storyConfig) {
  const anchor = container.querySelector('[data-story-anchor]');
  if (!anchor) return;
  const name = pickLocalized(data, 'name', lang);
  if (!name) {
    anchor.innerHTML = '<p class="detail-muted">条目缺少名称，无法关联剧情。</p>';
    return;
  }
  try {
    const res = await api(`/api/stories/${encodeURIComponent(state.dataSource)}?character=${encodeURIComponent(name)}`);
    const list = Array.isArray(res?.data) ? res.data : [];
    if (!list.length) {
      anchor.innerHTML = '<p class="detail-muted">该角色暂无关联剧情。</p>';
      return;
    }
    anchor.innerHTML = `
      <h2>${escapeHtml(storyConfig.title)}</h2>
      <div class="detail-related-grid">
        ${list.map((story) => {
          if (!story.key) throw new Error('剧情文档缺少 key，无法生成跳转');
          const key = escapeHtml(story.key);
          const title = escapeHtml(pickLocalized(story, storyConfig.fields.title, lang));
          return `<button class="detail-related-card" type="button" data-story-key="${key}"><div><strong>${title}</strong></div></button>`;
        }).join('')}
      </div>`;
    anchor.querySelectorAll('[data-story-key]').forEach((el) => {
      el.addEventListener('click', () => navigateToStory(el.dataset.storyKey));
    });
  } catch (error) {
    console.error(error);
    anchor.innerHTML = `<p class="detail-error">剧情加载失败：${escapeHtml(error?.message || String(error))}</p>`;
  }
}
