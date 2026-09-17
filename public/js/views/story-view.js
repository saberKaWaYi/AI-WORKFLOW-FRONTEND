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
 * 接口失败就是失败，明确报错，不用"尚未接入"把问题糊过去。
 *
 * 剧情文档的字段名由 profile.storyFields 声明（键为渲染角色，值为该业务的字段名），
 * 值均为 {xxx_zh} 扁平本地化块，因此本文件不含任何业务名或业务字段名。
 */
import { api } from '../core/api.js';
import { escapeHtml } from '../core/utils.js';
import { navigateToStory } from '../core/router.js';
import { getStoryConfig, requireProfile } from '../systems/data/business-profile.js';
import { SCOPE, createChecker, logViolations, renderContractErrors } from '../systems/data/contract.js';

/** 从本地化块里取值。剧情表是单语中文表，只认 {字段_zh}，不做语言降级。 */
function pickBlock(block, field) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return '';
  return block[`${field}_zh`] || '';
}

/** 剧情文档契约：key 与标题字段必须存在，否则无法跳转也无法辨识。 */
function checkStoryContract(config, story) {
  const checker = createChecker('剧情文档');
  const subject = story?.key || '(缺少 key)';
  checker.require(story?.key, SCOPE.MONGO, subject, 'key');
  checker.require(story?.[config.fields.title], SCOPE.MONGO, subject, config.fields.title);
  return checker.violations;
}

function categoryLabel(config, category) {
  const value = pickBlock(category, config.fields.category);
  return config.categoryLabels?.[value] || value || '未分类';
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
  const key = escapeHtml(story.key);
  const title = escapeHtml(pickBlock(story[config.fields.title], config.fields.title));
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
  return shell(business, heading, `<p class="detail-muted">${escapeHtml(message)}</p>`);
}

/** 加载失败：走错误样式，不伪装成"暂无数据"。 */
function failure(business, heading, message) {
  return shell(business, heading, `<div class="detail-error"><strong>${escapeHtml(heading)}加载失败</strong><p>${escapeHtml(message)}</p></div>`);
}

function shell(business, heading, body) {
  return `
    <div class="detail-page">
      <header class="detail-header">
        <button class="ghost-btn detail-back" type="button" data-story-back>← 返回</button>
        <p class="detail-breadcrumb">${escapeHtml(business)} / 剧情库</p>
      </header>
      <div class="detail-section">
        <h2>${escapeHtml(heading)}</h2>
        ${body}
      </div>
    </div>`;
}

export async function renderStoriesPage(container, business) {
  container.classList.remove('is-hidden');
  bindStoryNavigation(container);

  try {
    requireProfile(business);
  } catch (error) {
    container.innerHTML = failure(business, '剧情库', error.message);
    return;
  }

  const config = getStoryConfig(business);
  if (!config) {
    container.innerHTML = notice(business, '剧情库', '该业务未启用剧情模块。');
    return;
  }

  container.innerHTML = skeleton('正在加载剧情列表…');

  let list = [];
  try {
    const res = await api(`/api/stories/${encodeURIComponent(business)}`);
    list = Array.isArray(res?.data) ? res.data : [];
  } catch (error) {
    console.error(error);
    container.innerHTML = failure(business, '剧情库', `剧情列表加载失败：${error?.message || error}`);
    return;
  }

  if (!list.length) {
    container.innerHTML = notice(business, '剧情库', '该业务暂无剧情数据。');
    return;
  }

  const violations = list.flatMap((story) => checkStoryContract(config, story));
  logViolations(violations, `剧情列表 ${business}`);

  const groups = groupByCategory(list, config);
  container.innerHTML = `
    <div class="detail-page">
      ${renderContractErrors(violations, `剧情列表 ${business}`)}
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

  try {
    requireProfile(business);
  } catch (error) {
    container.innerHTML = failure(business, '剧情', error.message);
    return;
  }

  const config = getStoryConfig(business);
  if (!config) {
    container.innerHTML = notice(business, '剧情', '该业务未启用剧情模块。');
    return;
  }

  container.innerHTML = skeleton();

  let story = null;
  try {
    const res = await api(`/api/stories/${encodeURIComponent(business)}/${encodeURIComponent(key)}`);
    story = res?.data ?? null;
  } catch (error) {
    console.error(error);
    container.innerHTML = failure(business, '剧情', `剧情加载失败：${error?.message || error}`);
    return;
  }

  if (!story) {
    container.innerHTML = notice(business, '剧情', `接口未返回剧情文档（${key}）。`);
    return;
  }

  const violations = checkStoryContract(config, story);
  logViolations(violations, `剧情 ${key}`);

  const title = pickBlock(story[config.fields.title], config.fields.title);
  const chapter = pickBlock(story[config.fields.chapter], config.fields.chapter);
  const episode = pickBlock(story[config.fields.episode], config.fields.episode);
  const summary = pickBlock(story[config.fields.summary], config.fields.summary);
  const lines = Array.isArray(story[config.fields.lines]) ? story[config.fields.lines] : [];
  const characters = Array.isArray(story[config.fields.characters]) ? story[config.fields.characters] : [];

  container.innerHTML = `
    <div class="detail-page">
      ${renderContractErrors(violations, `剧情 ${key}`)}
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
