/**
 * 详情正文的区块渲染器。
 * 全部为纯函数：接收数据与语言，返回 HTML 字符串，不持有业务状态。
 */
import { escapeHtml } from '../../core/utils.js';
import {
  pickImageUrl,
  pickLocalized,
  pickLocalizedList,
  pickLocalizedObject,
  pickLocalizedRaw,
  upgradeImageUrl
} from '../../systems/data/node-fields.js';

const VOICE_LANG_LABELS = { zh: '中文', jp: '日文', en: '英文', kr: '韩文' };

/**
 * 当前选中的语音语种。
 * 语音区是唯一需要跨次渲染记住选择的区块，故在此就近持有，由外部显式重置。
 */
let voiceLanguage = '';

/** 切换节点时应传入空字符串重置选择。 */
export function setVoiceLanguage(lang) {
  voiceLanguage = lang;
}

/** 保留当前选择；不可用则回落到第一条可用语种，无可用语种返回空串。 */
export function ensureVoiceLanguage(voice) {
  const languages = collectVoiceLanguages(voice);
  if (!languages.length) return '';
  if (languages.includes(voiceLanguage)) return voiceLanguage;
  voiceLanguage = languages[0];
  return voiceLanguage;
}

/* ---------- 区块分发 ---------- */

export function renderMetaSection(profile, data, lang) {
  const items = (profile.metaFields || [])
    .map(([field, label]) => {
      const value = pickLocalized(data, field, lang);
      return value
        ? `<div class="detail-meta-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
        : '';
    })
    .filter(Boolean)
    .join('');
  if (!items) return '';
  return `
    <section class="detail-section" data-section="基本属性">
      <h2>基本属性</h2>
      <div class="detail-meta-grid">${items}</div>
    </section>
  `;
}

export function renderSection(section, data, lang) {
  const { field, title, type } = section;
  const raw = pickLocalizedRaw(data, field, lang);

  switch (type) {
    case 'text':
      return renderTextSection(title, pickLocalized(data, field, lang));
    case 'story-list':
      return renderListSection(title, pickStoryList(data, lang));
    case 'kv-list':
      return renderKeyValueSection(title, pickLocalizedMap(data, field, lang));
    case 'kv-object':
      return renderObjectSection(title, pickLocalizedObject(data, field, lang), section.labels);
    case 'titled-list':
      return renderTitledListSection(title, pickLocalizedList(data, field, lang));
    case 'image-list':
      return renderImageSection(title, data[field]);
    case 'gif-list':
      return renderGifs(data[field]);
    case 'voice': {
      const voiceList = Array.isArray(data[field]) ? data[field] : [];
      return renderVoice(voiceList, ensureVoiceLanguage(voiceList));
    }
    case 'entry-list':
      return renderEntryListSection(title, pickRawOrLocalized(data, field, lang), section.map);
    case 'audio-list':
      return renderAudioListSection(title, pickRawOrLocalized(data, field, lang), section.map);
    case 'dialogue-list':
      return renderDialogueListSection(title, pickRawOrLocalized(data, field, lang), section.map);
    default:
      return renderAutoSection(title, raw);
  }
}

export function renderAutoSection(title, value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return renderTextSection(title, value);
  if (Array.isArray(value)) {
    if (value.length && value.every((item) => item && typeof item === 'object' && ('title' in item || 'content' in item))) {
      return renderTitledListSection(title, value);
    }
    if (value.length && value.every((item) => typeof item === 'string')) {
      return renderListSection(title, value);
    }
    return renderKeyValueSection(title, value);
  }
  if (typeof value === 'object') return renderObjectSection(title, value);
  return '';
}

/* ---------- 各类区块 ---------- */

export function renderTextSection(title, text) {
  if (!text) return '';
  return `
    <section class="detail-section" data-section="${escapeHtml(title)}">
      <h2>${escapeHtml(title)}</h2>
      <div class="detail-text">${escapeHtml(text)}</div>
    </section>
  `;
}

export function renderListSection(title, items) {
  const flat = flattenItems(items);
  if (!flat.length) return '';
  return `
    <section class="detail-section" data-section="${escapeHtml(title)}">
      <h2>${escapeHtml(title)}</h2>
      <div class="detail-list">
        ${flat.map((item) => `<p class="detail-list-item">${escapeHtml(item)}</p>`).join('')}
      </div>
    </section>
  `;
}

export function renderTitledListSection(title, items) {
  if (!Array.isArray(items) || !items.length) return '';
  const cards = items
    .map((item) => {
      if (item && typeof item === 'object') {
        const heading = item.title || item.name || '';
        const body = item.content || item.text || item.description || '';
        if (!heading && !body) return '';
        return `
          <article class="detail-entry">
            ${heading ? `<div class="detail-entry-head"><span class="detail-entry-title">${escapeHtml(heading)}</span>${item.type ? `<span class="detail-entry-badge">${escapeHtml(item.type)}</span>` : ''}</div>` : ''}
            ${body ? `<div class="detail-entry-body">${escapeHtml(body)}</div>` : ''}
          </article>
        `;
      }
      return `<p class="detail-list-item">${escapeHtml(String(item))}</p>`;
    })
    .filter(Boolean)
    .join('');
  if (!cards) return '';
  return `
    <section class="detail-section" data-section="${escapeHtml(title)}">
      <h2>${escapeHtml(title)}</h2>
      <div class="detail-entry-list">${cards}</div>
    </section>
  `;
}

export function renderObjectSection(title, entries, labels) {
  if (!entries || typeof entries !== 'object') return '';
  const items = Object.entries(entries)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => ({
      key: labels?.[key] || key,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value)
    }));
  if (!items.length) return '';
  return `
    <section class="detail-section" data-section="${escapeHtml(title)}">
      <h2>${escapeHtml(title)}</h2>
      <div class="detail-kv-list">
        ${items.map(({ key, value }) => `
          <article class="detail-kv-item">
            <div class="detail-kv-key">${escapeHtml(key)}</div>
            <div class="detail-kv-value">${escapeHtml(value)}</div>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

export function renderKeyValueSection(title, items) {
  const entries = flattenKeyValueItems(items);
  if (!entries.length) return '';
  return `
    <section class="detail-section" data-section="${escapeHtml(title)}">
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

export function renderImageSection(title, images) {
  if (!Array.isArray(images) || !images.length) return '';
  const cards = images
    .map((item) => {
      const url = upgradeImageUrl(pickImageUrl(item));
      if (!url) return '';
      const desc = item?.description || title;
      return `
        <figure class="detail-image-item">
          <div class="detail-image-frame">
            <img src="${escapeHtml(url)}" alt="${escapeHtml(desc)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">
          </div>
          ${desc ? `<figcaption>${escapeHtml(excerpt(desc, 72))}</figcaption>` : ''}
        </figure>
      `;
    })
    .filter(Boolean)
    .join('');
  return cards ? `<section class="detail-section" data-section="${escapeHtml(title)}"><h2>${escapeHtml(title)}</h2><div class="detail-image-grid">${cards}</div></section>` : '';
}

export function renderGifs(gifs) {
  if (!Array.isArray(gifs) || !gifs.length) return '';
  return `
    <section class="detail-section" data-section="动作">
      <h2>动作</h2>
      <div class="detail-image-grid">
        ${gifs.map((item) => {
          const url = upgradeImageUrl(pickImageUrl(item));
          if (!url) return '';
          return `
            <figure class="detail-image-item">
              <div class="detail-image-frame">
                <img src="${escapeHtml(url)}" alt="${escapeHtml(item.description || '')}" loading="lazy" decoding="async" referrerpolicy="no-referrer">
              </div>
              ${item.description ? `<figcaption>${escapeHtml(excerpt(item.description, 72))}</figcaption>` : ''}
            </figure>
          `;
        }).filter(Boolean).join('')}
      </div>
    </section>
  `;
}

export function renderVoice(voice, lang) {
  const languages = collectVoiceLanguages(voice);
  if (!languages.length || !lang) return '';
  const items = voice
    .map((entry, index) => {
      const item = entry?.[lang];
      if (!item || typeof item !== 'object' || (!item.text && !item.url)) return '';
      return `
        <article class="detail-voice-item">
          <div class="detail-voice-item-title">第 ${index + 1} 条</div>
          ${item.text ? `<p>${escapeHtml(item.text)}</p>` : ''}
          ${item.url ? `<audio controls preload="none" src="${escapeHtml(item.url)}"></audio>` : '<p class="detail-muted">暂无音频</p>'}
        </article>
      `;
    })
    .filter(Boolean)
    .join('');

  return `
    <section class="detail-section" data-section="语音">
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

/* ---------- 工具 ---------- */

function collectVoiceLanguages(voice) {
  const seen = new Set();
  voice.forEach((entry) => {
    Object.entries(entry || {}).forEach(([langKey, voiceItem]) => {
      if (voiceItem && typeof voiceItem === 'object' && (voiceItem.text || voiceItem.url)) seen.add(langKey);
    });
  });
  return [...seen];
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

/** 组合型区块优先取原始值（多为数组），取不到再退回本地化块。 */
function pickRawOrLocalized(data, field, lang) {
  const raw = data?.[field];
  if (Array.isArray(raw) || (raw && typeof raw === 'object')) return raw;
  return pickLocalizedRaw(data, field, lang);
}

function pickStoryList(data, lang) {
  const stories = data?.storys;
  if (!stories || typeof stories !== 'object') return [];
  const candidates = [stories[`story_${lang}`], stories.story_zh, stories.story_en];
  return candidates.find((item) => Array.isArray(item) && item.length)
    || candidates.find(Array.isArray)
    || [];
}

function excerpt(text, maxLength) {
  const value = String(text || '');
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

/* ---------- 组合型区块 ---------- */

/**
 * 以下是「字段映射型」渲染器：渲染器只认 heading / badge / body / extra 这类**角色**，
 * 具体从数据里哪个字段取值由 profile 的 map 声明。
 * 这样不同业务的字段命名差异被 profile 吸收，渲染器保持业务无关。
 */

const DEFAULT_ENTRY_MAP = {
  heading: ['title', 'name'],
  badge: ['badge', 'type'],
  body: ['content', 'text', 'description']
};

const DEFAULT_AUDIO_MAP = { heading: ['title', 'name', 'scene'], urls: ['urls', 'voices'] };

const DEFAULT_DIALOGUE_MAP = {
  groups: 'chapters',
  heading: ['title', 'group'],
  lines: 'lines',
  speaker: 'speaker',
  text: 'text',
  voice: 'voice',
  note: 'note'
};

/** 从一个条目里按映射取若干字段，拼接成字符串（支持多字段 fallback）。 */
function pickMapped(item, keys) {
  const list = Array.isArray(keys) ? keys : keys ? [keys] : [];
  return list
    .map((key) => item?.[key])
    .filter((value) => value != null && value !== '')
    .map(String)
    .join(' ')
    .trim();
}

/** 从一个条目里按映射取列表字段（支持多字段 fallback）。 */
function pickMappedList(item, keys) {
  const list = Array.isArray(keys) ? keys : keys ? [keys] : [];
  for (const key of list) {
    const value = asArray(item?.[key]);
    if (value.length) return value;
  }
  return [];
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * entry-list：条目卡片列表。
 * map: { heading, badge, body, extra, extraLabel, icon, ordinal, headingPrefix, variant }
 */
export function renderEntryListSection(title, items, map) {
  const list = asArray(items);
  if (!list.length) return '';
  const conf = { ...DEFAULT_ENTRY_MAP, ...(map || {}) };
  const cards = list
    .map((item, index) => {
      if (!item || typeof item !== 'object') return '';
      const heading = pickMapped(item, conf.heading);
      const badge = pickMapped(item, conf.badge);
      const body = pickMapped(item, conf.body);
      const extra = pickMapped(item, conf.extra);
      if (!heading && !body && !extra) return '';
      const prefix = conf.headingPrefix || '';
      const iconMark = conf.icon
        ? `<span class="detail-entry-icon">${escapeHtml(conf.icon)}</span>`
        : conf.ordinal
          ? `<span class="detail-entry-icon">${index + 1}</span>`
          : '';
      return `
        <article class="detail-entry${conf.variant ? ` ${conf.variant}` : ''}">
          ${heading || badge
            ? `<div class="detail-entry-head">${iconMark}${heading ? `<span class="detail-entry-title">${escapeHtml(prefix + heading)}</span>` : ''}${badge ? `<span class="detail-entry-badge">${escapeHtml(badge)}</span>` : ''}</div>`
            : ''}
          ${body ? `<div class="detail-entry-body">${escapeHtml(body)}</div>` : ''}
          ${extra
            ? `<div class="detail-entry-body detail-entry-extra">${conf.extraLabel ? `<strong>${escapeHtml(conf.extraLabel)}</strong>` : ''}${escapeHtml(extra)}</div>`
            : ''}
        </article>`;
    })
    .filter(Boolean)
    .join('');
  if (!cards) return '';
  return `
    <section class="detail-section" data-section="${escapeHtml(title)}">
      <h2>${escapeHtml(title)}</h2>
      <div class="detail-entry-list">${cards}</div>
    </section>
  `;
}

/** audio-list：分组音频列表。map: { heading, urls } */
export function renderAudioListSection(title, items, map) {
  const list = asArray(items);
  if (!list.length) return '';
  const conf = { ...DEFAULT_AUDIO_MAP, ...(map || {}) };
  const cards = list
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const heading = pickMapped(item, conf.heading);
      const urls = pickMappedList(item, conf.urls).filter((url) => typeof url === 'string' && url);
      if (!urls.length) return '';
      return `
        <article class="detail-entry detail-audio-card">
          ${heading ? `<div class="detail-entry-head"><span class="detail-entry-title detail-audio-scene">${escapeHtml(heading)}</span></div>` : ''}
          <div class="detail-audio-stack">
            ${urls.map((url, i) => `
              <div class="detail-audio-item">
                <span class="detail-audio-index">${i + 1}</span>
                <audio controls preload="none" src="${escapeHtml(url)}"></audio>
              </div>`).join('')}
          </div>
        </article>`;
    })
    .filter(Boolean)
    .join('');
  if (!cards) return '';
  return `
    <section class="detail-section" data-section="${escapeHtml(title)}">
      <h2>${escapeHtml(title)}</h2>
      <div class="detail-entry-list detail-audio-list">${cards}</div>
    </section>
  `;
}

/**
 * dialogue-list：对话组列表（一组台词）。
 * map: { groups, heading, lines, speaker, text, voice, note, scroll, link, variant, icon }
 * groups 为空时，items 本身即对话组数组。
 */
export function renderDialogueListSection(title, items, map) {
  if (!items || typeof items !== 'object') return '';
  const conf = { ...DEFAULT_DIALOGUE_MAP, ...(map || {}) };
  const groups = Array.isArray(items) ? items : asArray(items?.[conf.groups]);
  if (!groups.length) return '';

  const cards = groups
    .map((group) => {
      if (!group || typeof group !== 'object') return '';
      const heading = pickMapped(group, conf.heading);
      const lines = asArray(group?.[conf.lines]);
      if (!heading && !lines.length) return '';
      const lineHtml = lines
        .map((line, index) => {
          if (!line || typeof line !== 'object') return '';
          const speaker = pickMapped(line, conf.speaker);
          const text = pickMapped(line, conf.text);
          const voice = pickMapped(line, conf.voice);
          const note = pickMapped(line, conf.note);
          // 单条台词不显示序号；整组无 speakers 时才用序号区分行
          const indexMark = conf.lineIndex && text ? `<span class="detail-line-index">${index + 1}</span>` : '';
          return `
            <div class="detail-dialogue-line">
              ${speaker ? `<div class="story-speaker">${escapeHtml(speaker)}</div>` : ''}
              ${text ? `<p class="story-text">${indexMark}${escapeHtml(text)}</p>` : ''}
              ${voice ? `<div class="detail-line-audio"><audio controls preload="none" src="${escapeHtml(voice)}"></audio></div>` : ''}
              ${note ? `<small class="detail-muted">${escapeHtml(note)}</small>` : ''}
            </div>`;
        })
        .filter(Boolean)
        .join('');
      const iconMark = conf.icon ? `<span class="detail-entry-icon">${escapeHtml(conf.icon)}</span>` : '';
      return `
        <article class="detail-entry${conf.variant ? ` ${conf.variant}` : ''}">
          ${heading ? `<div class="detail-entry-head">${iconMark}<span class="detail-entry-title">${escapeHtml(heading)}</span></div>` : ''}
          <div class="detail-dialogue">${lineHtml || '<p class="detail-muted">（暂无台词文本）</p>'}</div>
        </article>`;
    })
    .filter(Boolean)
    .join('');

  if (!cards) return '';
  const link = typeof conf.link === 'string' && typeof items?.[conf.link] === 'string' && items[conf.link]
    ? `<p class="detail-muted detail-story-link"><a href="${escapeHtml(items[conf.link])}" target="_blank" rel="noopener">查看完整内容 →</a></p>`
    : '';
  const body = conf.scroll
    ? `<div class="detail-story-scroll"><div class="detail-entry-list">${cards}</div></div>`
    : `<div class="detail-entry-list">${cards}</div>`;
  return `
    <section class="detail-section" data-section="${escapeHtml(title)}">
      <h2>${escapeHtml(title)}</h2>
      ${body}${link}
    </section>
  `;
}
