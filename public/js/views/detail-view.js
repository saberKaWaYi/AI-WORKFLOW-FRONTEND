import { api } from '../core/api.js';
import { DATA_TEXT, state } from '../core/state.js';
import { escapeHtml } from '../core/utils.js';
import { navigateToDetail } from '../core/router.js';
import { edgeEndpoint, getName, getOtherName, getRelationText, pickLocalized, pickLocalizedList } from '../systems/data/character-utils.js';
import { getRelatedNodes } from '../systems/data/network-index.js';

let container = null;
let onBack = null;
let dataShell = null;
let detailIndex = null;
let voiceLanguage = '';
let voiceCharacterId = '';
let detailRequestSeq = 0;

const VOICE_LANG_LABELS = { zh: '中文', jp: '日文', en: '英文', kr: '韩文' };
const DATA_ONLY_FIELDS = [
  ['identity', '身份'],
  ['title', '称号'],
  ['element', '元素'],
  ['weapon', '武器'],
  ['personal_faction', '所属'],
  ['national_faction', '国家'],
  ['gender', '性别'],
  ['race', '种族'],
  ['born_date', '生日'],
  ['born_area', '出生地'],
  ['body_type', '体型'],
  ['constellation', '命座'],
  ['role_position', '定位'],
  ['bond_prop', '羁绊']
];

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
    navigateToDetail(related.dataset.relatedId, state.detail.sourceView || 'cards');
    return;
  }

  const toggle = event.target.closest('[data-expand-toggle]');
  if (toggle) {
    const card = toggle.closest('[data-expand-card]');
    const expanded = card?.classList.toggle('is-expanded');
    toggle.textContent = expanded ? '收起' : '展开';
  }
}

function onChange(event) {
  const select = event.target.closest('[data-voice-lang-select]');
  if (!select) return;
  voiceLanguage = select.value;
  if (state.detail.characterId) renderDetail(state.detail.characterId);
}

export async function showDetail(characterId, { index, sourceView = 'cards', onReady }) {
  state.detail.characterId = characterId;
  state.detail.sourceView = sourceView;
  detailIndex = index;
  if (voiceCharacterId !== characterId) {
    voiceLanguage = '';
    voiceCharacterId = characterId;
  }
  detailRequestSeq += 1;
  const requestSeq = detailRequestSeq;
  dataShell?.classList.remove('sidebar-collapsed');
  dataShell?.classList.add('detail-mode');
  container?.classList.remove('is-hidden');
  await loadDetail(characterId, requestSeq);
  onReady?.();
}

export function hideDetail() {
  container?.classList.add('is-hidden');
  state.detail.data = null;
  state.detail.characterId = '';
  state.detail.sourceView = '';
  voiceLanguage = '';
  voiceCharacterId = '';
  detailRequestSeq += 1;
  dataShell?.classList.remove('detail-mode');
}

async function loadDetail(characterId, requestSeq) {
  if (!container) return;
  state.detail.loading = true;
  renderLoading(characterId);

  const params = new URLSearchParams({ business_name: state.dataSource, name: characterId });
  const result = await api(`/api/nodes?${params}`);
  if (requestSeq !== detailRequestSeq) return;
  state.detail.data = result.data;
  state.detail.loading = false;
  renderDetail(characterId);
}

function renderLoading(characterId) {
  container.innerHTML = `
    <div class="detail-page">
      <header class="detail-header">
        <button class="ghost-btn detail-back" type="button" data-detail-back>${escapeHtml(DATA_TEXT.back)}</button>
        <p class="detail-breadcrumb">${escapeHtml(state.dataSource)} / ${escapeHtml(labelSource(state.detail.sourceView))} / ${escapeHtml(characterId)}</p>
      </header>
      <div class="detail-skeleton">${escapeHtml(DATA_TEXT.detailLoading)}</div>
    </div>
  `;
}

function renderDetail(characterId) {
  const data = state.detail.data || {};
  const lang = state.dataLanguage || 'zh';
  const node = state.data.nodes?.find((item) => item.vid === characterId);
  const namePrimary = pickLocalized(data, 'name', lang) || getName(node, lang) || characterId;
  const nameSecondary = getOtherName(node, lang) || pickLocalized(data, 'name', lang === 'zh' ? 'en' : 'zh');
  const portrait = pickImageUrl(data?.pngs?.[0]) || node?.properties?.photo || '';
  const voice = Array.isArray(data.voice) ? data.voice : [];
  const activeVoiceLang = ensureVoiceLanguage(voice);
  const related = getRelatedNodes(detailIndex || { relatedById: new Map() }, characterId);

  container.innerHTML = `
    <div class="detail-page">
      <header class="detail-header">
        <button class="ghost-btn detail-back" type="button" data-detail-back>${escapeHtml(DATA_TEXT.back)}</button>
        <p class="detail-breadcrumb">${escapeHtml(state.dataSource)} / ${escapeHtml(labelSource(state.detail.sourceView))} / ${escapeHtml(namePrimary)}</p>
      </header>

      <section class="detail-hero">
        <div class="detail-portrait">${portrait ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(namePrimary)}" loading="lazy" decoding="async">` : ''}</div>
        <div class="detail-hero-text">
          <h1>${escapeHtml(namePrimary)}</h1>
          ${nameSecondary ? `<p class="detail-subname">${escapeHtml(nameSecondary)}</p>` : ''}
          ${renderLine(pickLocalized(data, 'title', lang))}
          ${renderLine(pickLocalized(data, 'identity', lang))}
          ${renderLine(pickLocalized(data, 'nick_name', lang), 'detail-nick')}
        </div>
      </section>

      <div class="detail-body">
        <section class="detail-section">
          <h2>基本属性</h2>
          <div class="detail-meta-grid">${renderMetaGrid(data, lang)}</div>
        </section>

        ${renderImageSection('图片', data.pngs)}
        ${renderTextSection('介绍', pickLocalized(data, 'introduction', lang))}
        ${renderListSection('故事', pickLocalizedList(data, 'storys', lang))}
        ${renderKeyValueSection('技能效果', pickLocalizedMap(data, 'skill_effect', lang))}
        ${renderKeyValueSection('等级效果', pickLocalizedMap(data, 'level_effect', lang))}
        ${renderGifs(data.gifs)}
        ${renderVoice(voice, activeVoiceLang)}
        ${renderRelated(related, lang)}
      </div>
    </div>
  `;
}

function renderLine(text, className = '') {
  if (!text) return '';
  return `<p class="${className}">${escapeHtml(text)}</p>`;
}

function renderMetaGrid(data, lang) {
  return DATA_ONLY_FIELDS.map(([field, label]) => {
    const value = pickLocalized(data, field, lang);
    return value ? `<div class="detail-meta-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>` : '';
  }).filter(Boolean).join('');
}

function renderTextSection(title, text) {
  if (!text) return '';
  return `
    <section class="detail-section">
      <h2>${escapeHtml(title)}</h2>
      ${renderExpandableCard(text, 'detail-text')}
    </section>
  `;
}

function renderListSection(title, items) {
  const flat = flattenItems(items);
  if (!flat.length) return '';
  return `
    <section class="detail-section">
      <h2>${escapeHtml(title)}</h2>
      <div class="detail-list">
        ${flat.map((item) => `
          ${renderExpandableCard(item, 'detail-list-item')}
        `).join('')}
      </div>
    </section>
  `;
}

function renderKeyValueSection(title, items) {
  const entries = flattenKeyValueItems(items);
  if (!entries.length) return '';
  return `
    <section class="detail-section">
      <h2>${escapeHtml(title)}</h2>
      <div class="detail-kv-list">
        ${entries.map(({ key, value }) => `
          <article class="detail-kv-item">
            <div class="detail-kv-key">${escapeHtml(key)}</div>
            <div class="detail-kv-value">${escapeHtml(value)}</div>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderImageSection(title, images) {
  if (!Array.isArray(images) || !images.length) return '';
  const cards = images.map((item) => {
    const url = pickImageUrl(item);
    if (!url) return '';
    const desc = item?.description || title;
    return `
      <figure class="detail-image-item">
        <div class="detail-image-frame">
          <img src="${escapeHtml(url)}" alt="${escapeHtml(desc)}" loading="lazy" decoding="async">
        </div>
        ${desc ? `<figcaption>${escapeHtml(excerpt(desc, 72))}${desc.length > 72 ? '<span class="detail-caption-more">展开</span>' : ''}</figcaption>` : ''}
      </figure>
    `;
  }).filter(Boolean).join('');
  return cards ? `<section class="detail-section"><h2>${escapeHtml(title)}</h2><div class="detail-image-grid">${cards}</div></section>` : '';
}

function renderGifs(gifs) {
  if (!Array.isArray(gifs) || !gifs.length) return '';
  return `
    <section class="detail-section">
      <h2>动作</h2>
      <div class="detail-image-grid">
        ${gifs.map((item) => {
          const url = pickImageUrl(item);
          if (!url) return '';
          return `
            <figure class="detail-image-item">
              <div class="detail-image-frame">
                <img src="${escapeHtml(url)}" alt="${escapeHtml(item.description || '')}" loading="lazy" decoding="async">
              </div>
              ${item.description ? `<figcaption>${escapeHtml(excerpt(item.description, 72))}</figcaption>` : ''}
            </figure>
          `;
        }).filter(Boolean).join('')}
      </div>
    </section>
  `;
}

function renderVoice(voice, lang) {
  const languages = collectVoiceLanguages(voice);
  if (!languages.length || !lang) return '';
  const items = voice.map((entry, index) => {
    const item = entry?.[lang];
    if (!item || typeof item !== 'object' || (!item.text && !item.url)) return '';
    return `
      <article class="detail-voice-item">
        <div class="detail-voice-item-title">第 ${index + 1} 条</div>
        ${item.text ? `<p>${escapeHtml(item.text)}</p>` : ''}
        ${item.url ? `<audio controls preload="none" src="${escapeHtml(item.url)}"></audio>` : '<p class="detail-muted">暂无音频</p>'}
      </article>
    `;
  }).filter(Boolean).join('');

  return `
    <section class="detail-section">
      <h2>语音</h2>
      <div class="detail-voice-shell">
        <div class="detail-voice-toolbar">
          <span class="detail-voice-hint">选择语种</span>
          <select class="detail-voice-select" data-voice-lang-select>
            ${languages.map((key) => `<option value="${escapeHtml(key)}" ${key === lang ? 'selected' : ''}>${escapeHtml(VOICE_LANG_LABELS[key] || key.toUpperCase())}</option>`).join('')}
          </select>
        </div>
        <div class="detail-voice-scroll">
          <div class="detail-voice-player">${items || '<p class="detail-muted">暂无语音内容</p>'}</div>
        </div>
      </div>
    </section>
  `;
}

function renderExpandableCard(text, className = '') {
  const full = String(text || '');
  const short = excerpt(full, 220);
  const hasMore = full.length > short.length;
  return `
    <div class="detail-expand-card ${className}" data-expand-card>
      <div class="detail-expand-preview">
        <div class="detail-expand-short">${escapeHtml(short)}</div>
      </div>
      ${hasMore ? `<button class="detail-expand-toggle" type="button" data-expand-toggle>展开</button>` : ''}
      <div class="detail-expand-full">${escapeHtml(full)}</div>
    </div>
  `;
}

function renderRelated(related, lang) {
  if (!related.length) {
    return `
      <section class="detail-section">
        <h2>${escapeHtml(DATA_TEXT.relatedTitle)}</h2>
        <p class="detail-muted">${escapeHtml(DATA_TEXT.noRelated)}</p>
      </section>
    `;
  }
  return `
    <section class="detail-section">
      <h2>${escapeHtml(DATA_TEXT.relatedTitle)}</h2>
      <div class="detail-related-grid">
        ${related.map(({ node, relations }) => {
          const label = getName(node, lang);
          const image = node.properties.photo || '';
          return `
            <button class="detail-related-card" type="button" data-related-id="${escapeHtml(node.vid)}" aria-label="${escapeHtml(label)}">
              <div class="detail-related-portrait">${image ? `<img src="${escapeHtml(image)}" alt="">` : ''}</div>
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

function pickImageUrl(item) {
  if (!item || typeof item !== 'object') return '';
  return item.png || item.gif || item.url || '';
}

function collectVoiceLanguages(voice) {
  const seen = new Set();
  voice.forEach((entry) => {
    Object.entries(entry || {}).forEach(([langKey, voiceItem]) => {
      if (voiceItem && typeof voiceItem === 'object' && (voiceItem.text || voiceItem.url)) seen.add(langKey);
    });
  });
  return [...seen];
}

function ensureVoiceLanguage(voice) {
  const languages = collectVoiceLanguages(voice);
  if (!languages.length) return '';
  if (languages.includes(voiceLanguage)) return voiceLanguage;
  voiceLanguage = languages[0];
  return voiceLanguage;
}

function flattenItems(items) {
  const result = [];
  const walk = (value) => {
    if (value == null || value === '') return;
    if (Array.isArray(value)) return value.forEach(walk);
    if (typeof value === 'object') return Object.values(value).forEach(walk);
    result.push(String(value));
  };
  walk(items);
  return result;
}

function flattenKeyValueItems(items) {
  const result = [];
  const walk = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    Object.entries(value).forEach(([key, val]) => {
      if (val == null || val === '') return;
      result.push({ key: String(key), value: String(val) });
    });
  };
  if (Array.isArray(items)) items.forEach(walk);
  else walk(items);
  return result;
}

function pickLocalizedMap(data, field, lang) {
  const block = data?.[field];
  if (!block || typeof block !== 'object') return [];
  const preferred = block[`${field}_${lang}`];
  if (Array.isArray(preferred) && preferred.length) return preferred;
  const zh = block[`${field}_zh`];
  if (Array.isArray(zh) && zh.length) return zh;
  const en = block[`${field}_en`];
  if (Array.isArray(en) && en.length) return en;
  return [];
}

function excerpt(text, maxLength) {
  const value = String(text || '');
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function labelSource(sourceView) {
  return sourceView === 'graph' ? '拓扑展示' : '列表展示';
}
