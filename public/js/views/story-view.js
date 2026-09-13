/**
 * PCR 故事页：浏览 pcr.stories 这张独立的 mongo 表。
 *
 * 入口有两处：
 *  - 直接从 #/data/stories 浏览全部剧情（按 category 分「主线 / 活动」）。
 *  - 从角色详情的「相关剧情」入口点进来（#/data/story/<key> 看单条）。
 *
 * 数据接口契约（后端待补，目前仅 pcr 提供 stories）：
 *  - GET /api/stories/{business}            -> { data: [ story, ... ] }
 *  - GET /api/stories/{business}/{key}      -> { data: story }
 * 接口未接入时，本视图会显示清晰的「接口尚未接入」提示，不会崩溃。
 *
 * 故事文档字段（均为 {xxx_zh} 扁平本地化块）：
 *  key / url / category / title / chapter / episode_no / summary / characters[] / lines[{speaker,text}]
 */
import { api } from '../core/api.js';
import { escapeHtml } from '../core/utils.js';
import { navigateToStory } from '../core/router.js';

const CATEGORY_LABELS = { '主线': '主线剧情', '活动': '活动剧情' };

function categoryLabel(category) {
  const value = typeof category === 'object' ? category?.category_zh : category;
  return CATEGORY_LABELS[value] || value || '剧情';
}

function pickZh(block) {
  if (!block || typeof block !== 'object') return '';
  return block.category_zh || block.title_zh || block.chapter_zh || block.episode_no_zh || block.summary_zh || '';
}

function groupByCategory(list) {
  const groups = new Map();
  for (const item of list) {
    const cat = pickZh(item.category) || '其他';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  }
  return groups;
}

function storyCard(story) {
  const key = escapeHtml(story.key || '');
  const title = escapeHtml(pickZh(story.title) || key);
  const chapter = pickZh(story.chapter);
  const characters = Array.isArray(story.characters) ? story.characters.length : 0;
  return `
    <button class="detail-related-card" type="button" data-story-key="${key}" aria-label="${title}">
      <div>
        <strong>${title}</strong>
        <div class="detail-related-relations">
          ${chapter ? `<span class="detail-related-relation">${escapeHtml(chapter)}</span>` : ''}
          ${characters ? `<span class="detail-related-relation">登场角色 ${characters}</span>` : ''}
        </div>
      </div>
    </button>
  `;
}

let storyNavBound = false;

function bindStoryNavigation(container) {
  if (storyNavBound) return;
  storyNavBound = true;
  container.addEventListener('click', (event) => {
    const story = event.target.closest('[data-story-key]');
    if (story) {
      event.preventDefault();
      navigateToStory(story.dataset.storyKey);
      return;
    }
    if (event.target.closest('[data-story-back]')) {
      event.preventDefault();
      history.back();
    }
  });
}

export async function renderStoriesPage(container, business) {
  container.classList.remove('is-hidden');
  bindStoryNavigation(container);
  container.innerHTML = `<div class="detail-page"><div class="detail-skeleton">正在加载剧情列表…</div></div>`;

  let list = [];
  try {
    const res = await api(`/api/stories/${encodeURIComponent(business)}`);
    list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
  } catch (e) {
    container.innerHTML = `
      <div class="detail-page">
        <header class="detail-header">
          <button class="ghost-btn detail-back" type="button" data-story-back>← 返回</button>
          <p class="detail-breadcrumb">${escapeHtml(business)} / 剧情库</p>
        </header>
        <div class="detail-section">
          <h2>剧情库</h2>
          <p class="detail-muted">剧情数据接口尚未接入（后端 GET /api/stories/${escapeHtml(business)} 暂不可用）。</p>
        </div>
      </div>`;
    return;
  }

  if (!list.length) {
    container.innerHTML = `
      <div class="detail-page">
        <header class="detail-header">
          <button class="ghost-btn detail-back" type="button" data-story-back>← 返回</button>
          <p class="detail-breadcrumb">${escapeHtml(business)} / 剧情库</p>
        </header>
        <div class="detail-section"><h2>剧情库</h2><p class="detail-muted">该业务暂无剧情数据。</p></div>
      </div>`;
    return;
  }

  const groups = groupByCategory(list);
  container.innerHTML = `
    <div class="detail-page">
      <header class="detail-header">
        <button class="ghost-btn detail-back" type="button" data-story-back>← 返回</button>
        <p class="detail-breadcrumb">${escapeHtml(business)} / 剧情库（${list.length}）</p>
      </header>
      ${[...groups.entries()].map(([cat, items]) => `
        <section class="detail-section">
          <h2>${escapeHtml(categoryLabel(cat))}（${items.length}）</h2>
          <div class="detail-related-grid">
            ${items.map((s) => storyCard(s)).join('')}
          </div>
        </section>
      `).join('')}
    </div>`;
}

export async function renderStoryDetail(container, business, key) {
  container.classList.remove('is-hidden');
  bindStoryNavigation(container);
  container.innerHTML = `<div class="detail-page"><div class="detail-skeleton">正在加载剧情…</div></div>`;

  let story = null;
  try {
    const res = await api(`/api/stories/${encodeURIComponent(business)}/${encodeURIComponent(key)}`);
    story = res?.data || res;
  } catch (e) {
    container.innerHTML = `
      <div class="detail-page">
        <header class="detail-header">
          <button class="ghost-btn detail-back" type="button" data-story-back>← 返回</button>
          <p class="detail-breadcrumb">${escapeHtml(business)} / 剧情库</p>
        </header>
        <div class="detail-section"><h2>剧情</h2><p class="detail-muted">剧情数据接口尚未接入。</p></div>
      </div>`;
    return;
  }

  if (!story) {
    container.innerHTML = `
      <div class="detail-page">
        <header class="detail-header">
          <button class="ghost-btn detail-back" type="button" data-story-back>← 返回</button>
          <p class="detail-breadcrumb">${escapeHtml(business)} / 剧情库</p>
        </header>
        <div class="detail-section"><h2>剧情</h2><p class="detail-muted">未找到该剧情（${escapeHtml(key)}）。</p></div>
      </div>`;
    return;
  }

  const title = pickZh(story.title) || key;
  const lines = Array.isArray(story.lines) ? story.lines : [];
  const characters = Array.isArray(story.characters) ? story.characters : [];

  container.innerHTML = `
    <div class="detail-page">
      <header class="detail-header">
        <button class="ghost-btn detail-back" type="button" data-story-back>← 返回</button>
        <p class="detail-breadcrumb">${escapeHtml(business)} / 剧情库 / ${escapeHtml(title)}</p>
      </header>
      <section class="detail-hero">
        <div class="detail-hero-text">
          <h1>${escapeHtml(title)}</h1>
          ${story.chapter ? `<p class="detail-subname">${escapeHtml(pickZh(story.chapter))}</p>` : ''}
          ${story.episode_no ? `<p class="detail-subname">${escapeHtml(pickZh(story.episode_no))}</p>` : ''}
          <p class="detail-subname">${escapeHtml(categoryLabel(story.category))}</p>
        </div>
      </section>
      <div class="detail-body">
        ${story.summary && pickZh(story.summary)
          ? `<section class="detail-section"><h2>概述</h2><div class="detail-text">${escapeHtml(pickZh(story.summary))}</div></section>`
          : ''}
        ${characters.length
          ? `<section class="detail-section"><h2>登场角色</h2><div class="detail-tags">${characters.map((c) => `<span class="detail-tag">${escapeHtml(c)}</span>`).join('')}</div></section>`
          : ''}
        ${lines.length
          ? `<section class="detail-section"><h2>剧情文本</h2><div class="story-lines">${lines.map(renderLine).join('')}</div></section>`
          : ''}
      </div>
    </div>`;
}

function renderLine(line) {
  if (!line || typeof line !== 'object') return '';
  const speaker = escapeHtml(line.speaker || '');
  const text = escapeHtml(line.text || '');
  return `
    <div class="story-line">
      ${speaker ? `<span class="story-speaker">${speaker}</span>` : ''}
      <span class="story-text">${text}</span>
    </div>`;
}
