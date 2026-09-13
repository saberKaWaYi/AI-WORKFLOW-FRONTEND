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
    case 'scp-links':
      return renderScpLinksSection(title, pickLocalizedList(data, field, lang));
    case 'image-list':
      return renderImageSection(title, data[field]);
    case 'gif-list':
      return renderGifs(data[field]);
    case 'voice': {
      const voiceList = Array.isArray(data[field]) ? data[field] : [];
      return renderVoice(voiceList, ensureVoiceLanguage(voiceList));
    }
    case 'pcr-skills':
      return renderPcrSkills(data[field]);
    case 'pcr-bonds':
      return renderPcrBonds(data[field]);
    case 'pcr-voices':
      return renderPcrVoices(data[field]);
    case 'pcr-chapters':
      return renderPcrChapters(data[field]);
    case 'pcr-story-lines':
      return renderPcrStoryLines(data[field]);
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

export function renderScpLinksSection(title, items) {
  if (!Array.isArray(items) || !items.length) return '';
  const cards = items
    .map((item) => {
      const id = item?.scp_id || item?.scpId || item?.key || '';
      if (!id) return '';
      const relation = item?.relationship || item?.relation || '';
      return `
        <button class="detail-related-card" type="button" data-related-id="${escapeHtml(String(id))}" aria-label="${escapeHtml(String(id))}">
          <div>
            <strong>${escapeHtml(String(id))}</strong>
            ${relation ? `<div class="detail-related-relations"><span class="detail-related-relation">${escapeHtml(relation)}</span></div>` : ''}
          </div>
        </button>
      `;
    })
    .filter(Boolean)
    .join('');
  if (!cards) return '';
  return `
    <section class="detail-section" data-section="${escapeHtml(title)}">
      <h2>${escapeHtml(title)}</h2>
      <div class="detail-related-grid">${cards}</div>
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

/* ---------- pcr 专用渲染器（字段结构为 pcr 特有，通用 type 接不住）---------- */

function renderPcrSkills(skills) {
  if (!Array.isArray(skills) || !skills.length) return '';
  const cards = skills.map((s, index) => {
    if (!s || typeof s !== 'object') return '';
    const name = [s.name_zh, s.name_extra].filter(Boolean).join(' ');
    const desc = s.description || '';
    const upName = s.upgraded_name_zh;
    const upDesc = s.upgraded_description;
    return `
      <article class="detail-entry pcr-skill-card">
        ${name ? `<div class="detail-entry-head"><span class="pcr-skill-icon">${index + 1}</span><span class="detail-entry-title">${escapeHtml(name)}</span>${s.slot != null ? `<span class="detail-entry-badge pcr-skill-slot">${escapeHtml(String(s.slot))}</span>` : ''}</div>` : ''}
        ${desc ? `<div class="detail-entry-body">${escapeHtml(desc)}</div>` : ''}
        ${(upName || upDesc) ? `<div class="detail-entry-body detail-entry-upgraded"><strong>升级后</strong>${escapeHtml([upName, upDesc].filter(Boolean).join(' — '))}</div>` : ''}
      </article>`;
  }).filter(Boolean).join('');
  if (!cards) return '';
  return `<section class="detail-section" data-section="技能"><h2>技能</h2><div class="detail-entry-list">${cards}</div></section>`;
}

function renderPcrBonds(bonds) {
  if (!Array.isArray(bonds) || !bonds.length) return '';
  const cards = bonds.map((b) => {
    if (!b || typeof b !== 'object') return '';
    const level = b.level != null ? `Lv.${b.level}` : '';
    const effect = b.effect || '';
    return `
      <article class="detail-entry pcr-bond-card">
        ${level ? `<div class="detail-entry-head"><span class="pcr-bond-icon">♥</span><span class="detail-entry-title pcr-bond-level">${escapeHtml(level)}</span></div>` : ''}
        ${effect ? `<div class="detail-entry-body">${escapeHtml(effect)}</div>` : ''}
      </article>`;
  }).filter(Boolean).join('');
  if (!cards) return '';
  return `<section class="detail-section" data-section="羁绊"><h2>羁绊</h2><div class="detail-entry-list">${cards}</div></section>`;
}

function renderPcrVoices(otherVoices) {
  if (!Array.isArray(otherVoices) || !otherVoices.length) return '';
  const cards = otherVoices.map((item) => {
    if (!item || typeof item !== 'object') return '';
    const scene = item.scene || '';
    const urls = Array.isArray(item.voices) ? item.voices.filter((u) => typeof u === 'string' && u) : [];
    if (!urls.length) return '';
    const audios = urls.map((u, i) => `
      <div class="pcr-voice-audio">
        <span class="pcr-voice-index">${i + 1}</span>
        <audio controls preload="none" src="${escapeHtml(u)}"></audio>
      </div>`).join('');
    return `
      <article class="detail-entry pcr-voice-card">
        ${scene ? `<div class="detail-entry-head"><span class="pcr-voice-scene">${escapeHtml(scene)}</span></div>` : ''}
        <div class="pcr-voice-stack">${audios}</div>
      </article>`;
  }).filter(Boolean).join('');
  if (!cards) return '';
  return `<section class="detail-section" data-section="语音"><h2>语音</h2><div class="detail-entry-list pcr-voice-list">${cards}</div></section>`;
}

function renderPcrChapters(stories) {
  if (!stories || typeof stories !== 'object') return '';
  const chapters = Array.isArray(stories.chapters) ? stories.chapters : [];
  if (!chapters.length) return '';
  const cards = chapters.map((c, index) => {
    if (!c || typeof c !== 'object') return '';
    const title = c.title || '';
    const lines = Array.isArray(c.lines) ? c.lines : [];
    const lineHtml = lines.map((ln) => {
      if (!ln || typeof ln !== 'object') return '';
      const speaker = ln.speaker ? escapeHtml(ln.speaker) : '';
      const text = ln.text ? escapeHtml(ln.text) : '';
      return `<div class="detail-dialogue-line">${speaker ? `<div class="story-speaker">${speaker}</div>` : ''}<p class="story-text">${text}</p></div>`;
    }).filter(Boolean).join('');
    const body = lineHtml || '<p class="detail-muted">（暂无台词文本）</p>';
    return `
      <article class="detail-entry pcr-chapter-card">
        ${title ? `<div class="detail-entry-head"><span class="pcr-chapter-index">${index + 1}</span><span class="detail-entry-title">${escapeHtml(title)}</span></div>` : ''}
        <div class="detail-dialogue">${body}</div>
      </article>`;
  }).filter(Boolean).join('');
  if (!cards) return '';
  const url = typeof stories.url === 'string' && stories.url
    ? `<p class="detail-muted pcr-story-link"><a href="${escapeHtml(stories.url)}" target="_blank" rel="noopener">查看完整故事 →</a></p>`
    : '';
  return `<section class="detail-section" data-section="角色故事"><h2>角色故事</h2><div class="detail-story-scroll"><div class="detail-entry-list">${cards}</div></div>${url}</section>`;
}

function renderPcrStoryLines(storyLines) {
  if (!Array.isArray(storyLines) || !storyLines.length) return '';
  const cards = storyLines.map((item) => {
    if (!item || typeof item !== 'object') return '';
    const group = item.group || '';
    const lines = Array.isArray(item.lines) ? item.lines : [];
    const lineHtml = lines.map((ln, i) => {
      if (!ln || typeof ln !== 'object') return '';
      const text = ln.text || '';
      const voice = typeof ln.voice === 'string' && ln.voice ? `<div class="pcr-story-voice"><audio controls preload="none" src="${escapeHtml(ln.voice)}"></audio></div>` : '';
      const note = ln.note ? `<small class="detail-muted">${escapeHtml(ln.note)}</small>` : '';
      return `<div class="detail-dialogue-line">${text ? `<p class="story-text"><span class="pcr-line-index">${i + 1}</span>${escapeHtml(text)}</p>` : ''}${voice}${note}</div>`;
    }).filter(Boolean).join('');
    return `
      <article class="detail-entry pcr-story-group">
        ${group ? `<div class="detail-entry-head"><span class="pcr-group-icon">❖</span><span class="detail-entry-title">${escapeHtml(group)}</span></div>` : ''}
        <div class="detail-dialogue">${lineHtml}</div>
      </article>`;
  }).filter(Boolean).join('');
  if (!cards) return '';
  return `<section class="detail-section" data-section="剧情台词"><h2>剧情台词</h2><div class="detail-entry-list">${cards}</div></section>`;
}
