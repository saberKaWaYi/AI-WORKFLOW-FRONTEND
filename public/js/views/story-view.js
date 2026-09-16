/**
 * 剧情库视图：浏览某业务独立的剧情 mongo 表。
 *
 * 入口有两处：
 *  - 直接从 #/data/stories 浏览全部剧情（按 category 分组）。
 *  - 从角色详情的剧情模块入口点进来（#/data/story/<key> 看单条）。
 *
 * 数据接口契约（按业务泛化，业务需在 profile 里声明 storyModule）：
 *  - GET /api/stories/{business}            -> { data: [ story, ... ] }
 *  - GET /api/stories/{business}/{key}      -> { data: story }
 * 接口未接入时，本视图会显示清晰的「接口尚未接入」提示，不会崩溃。
 *
 * 剧情文档的字段名由 profile.storyFields 声明（键为渲染角色，值为该业务的字段名），
 * 值均为 {xxx_zh} 扁平本地化块，因此本文件不含任何业务名或业务字段名。
 */
import { api } from '../core/api.js';
import { escapeHtml } from '../core/utils.js';
import { navigateToStory } from '../core/router.js';
import { getStoryConfig } from '../systems/data/business-profile.js';

/** 从本地化块里取值；块本身是字符串时原样返回。 */
function pickBlock(block, field) {
  if (!block) return '';
  if (typeof block === 'string') return block;
  if (typeof block !== 'object') return '';
  return block[`${field}_zh`] || block[`${field}_en`] || '';
}

function categoryLabel(config, category) {
  const value = pickBlock(category, config.fields.category);
  return config.categoryLabels?.[value] || value || '剧情';
}

function groupByCategory(list, config) {
  const groups = new Map();
  for (const item of list) {
    const cat = pickBlock(item?.[config.fields.category], config.fields.category) || '其他';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  }
  return groups;
}

function storyCard(config, story) {
  const key = escapeHtml(story.key || '');
  const title = escapeHtml(pickBlock(story[config.fields.title], config.fields.title) || key);
  const chapter = pickBlock(story[config.fields.chapter], config.fields.chapter);
  const characters = Array.isArray(story[config.fields.characters]) ? story[config.fields.characters].length : 0;
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

function skeleton(text = '正在加载剧情…') {
  return `<div class="detail-page"><div class="detail-skeleton">${escapeHtml(text)}</div></div>`;
}

function notice(business, heading, message) {
  return `
    <div class="detail-page">
      <header class="detail-header">
        <button class="ghost-btn detail-back" type="button" data-story-back>← 返回</button>
        <p class="detail-breadcrumb">${escapeHtml(business)} / 剧情库</p>
      </header>
      <div class="detail-section">
        <h2>${escapeHtml(heading)}</h2>
        <p class="detail-muted">${escapeHtml(message)}</p>
      </div>
    </div>`;
}

export async function renderStoriesPage(container, business) {
  container.classList.remove('is-hidden');
  bindStoryNavigation(container);

  const config = getStoryConfig(business);
  if (!config) {
    container.innerHTML = notice(business, '剧情库', '该业务未启用剧情模块。');
    return;
  }

  container.innerHTML = skeleton('正在加载剧情列表…');

  let list = [];
  try {
    const res = await api(`/api/stories/${encodeURIComponent(business)}`);
    list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  } catch (e) {
    container.innerHTML = notice(business, '剧情库', `剧情数据接口尚未接入（后端 GET /api/stories/${business} 暂不可用）。`);
    return;
  }

  if (!list.length) {
    container.innerHTML = notice(business, '剧情库', '该业务暂无剧情数据。');
    return;
  }

  const groups = groupByCategory(list, config);
  container.innerHTML = `
    <div class="detail-page">
      <header class="detail-header">
        <button class="ghost-btn detail-back" type="button" data-story-back>← 返回</button>
        <p class="detail-breadcrumb">${escapeHtml(business)} / 剧情库（${list.length}）</p>
      </header>
      ${[...groups.entries()].map(([cat, items]) => `
        <section class="detail-section">
          <h2>${escapeHtml(categoryLabel(config, cat))}（${items.length}）</h2>
          <div class="detail-related-grid">
            ${items.map((s) => storyCard(config, s)).join('')}
          </div>
        </section>
      `).join('')}
    </div>`;
}

export async function renderStoryDetail(container, business, key) {
  container.classList.remove('is-hidden');
  bindStoryNavigation(container);

  const config = getStoryConfig(business);
  if (!config) {
    container.innerHTML = notice(business, '剧情', '该业务未启用剧情模块。');
    return;
  }

  container.innerHTML = skeleton();

  let story = null;
  try {
    const res = await api(`/api/stories/${encodeURIComponent(business)}/${encodeURIComponent(key)}`);
    story = res?.data || res;
  } catch (e) {
    container.innerHTML = notice(business, '剧情', '剧情数据接口尚未接入。');
    return;
  }

  if (!story) {
    container.innerHTML = notice(business, '剧情', `未找到该剧情（${key}）。`);
    return;
  }

  const title = pickBlock(story[config.fields.title], config.fields.title) || key;
  const chapter = pickBlock(story[config.fields.chapter], config.fields.chapter);
  const episode = pickBlock(story[config.fields.episode], config.fields.episode);
  const summary = pickBlock(story[config.fields.summary], config.fields.summary);
  const lines = Array.isArray(story[config.fields.lines]) ? story[config.fields.lines] : [];
  const characters = Array.isArray(story[config.fields.characters]) ? story[config.fields.characters] : [];

  container.innerHTML = `
    <div class="detail-page">
      <header class="detail-header">
        <button class="ghost-btn detail-back" type="button" data-story-back>← 返回</button>
        <p class="detail-breadcrumb">${escapeHtml(business)} / 剧情库 / ${escapeHtml(title)}</p>
      </header>
      <section class="detail-hero">
        <div class="detail-hero-text">
          <h1>${escapeHtml(title)}</h1>
          ${chapter ? `<p class="detail-subname">${escapeHtml(chapter)}</p>` : ''}
          ${episode ? `<p class="detail-subname">${escapeHtml(episode)}</p>` : ''}
          <p class="detail-subname">${escapeHtml(categoryLabel(config, story[config.fields.category]))}</p>
        </div>
      </section>
      <div class="detail-body">
        ${summary
          ? `<section class="detail-section"><h2>概述</h2><div class="detail-text">${escapeHtml(summary)}</div></section>`
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
