import { setHidden } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';
import { initMention } from './mention.js';
import { initPreview } from './preview.js';

/**
 * 文本 AI 任务链入口。
 *
 * 两种模式共用一个外壳，靠侧边栏的下拉框切换，只改可见性、不持久化：
 *   reader  读者模式 —— 占位「还在开发中」
 *   author  作者模式 —— 底部对话框，提交后走 /api/text/tasks，
 *            再轮询 /api/text/tasks/{task_id} 直到出结果，条目堆在会话流里（只存内存，刷新即清）
 *
 * 作者模式的「厂商 / 模型」两个下拉框由 TEXT-GENERATE 提供数据，
 * 本服务只按当前登录身份转发 /api/text/*，不查询数据库：
 *   厂商 = 该用户在系统管理「我的配置」里填的 model_providers
 *   模型 = TEXT-GENERATE 自身配置里该厂商可用的模型
 */

const MODE = {
  READER: 'reader',
  AUTHOR: 'author'
};

// 生成模式：底部胶囊按钮的枚举值，点一下轮到下一个。
// value 是将来传给 TEXT-GENERATE 的字段值，label 只负责显示在按钮上。
const GEN_MODES = [
  { value: 'outline', label: '大纲生成' },
  { value: 'content', label: '正文生成' }
];

// 生成是异步的：受理接口只返回任务号，真正的活在 worker 那边干。
// 所以提交之后靠轮询任务状态拿结果。
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 300;

// 主表状态 -> 会话流里的进行中文案。success / failed 是终点，不在这里列。
const RUNNING_TEXT = {
  pending: '已受理，排队中…',
  processing: '正在生成…'
};

let dom = {};
let inited = false;
let sending = false;
let regenerating = false;

// 作者模式内部的三个视图：thread 会话 / shelf 书架 / detail 小说详情。
let authorView = 'thread';
// 书架分页与当前打开的小说。
let shelfPage = 1;
let shelfTotal = 0;
const SHELF_PAGE_SIZE = 10;
let currentNovel = null;

export async function initTextApp(elements) {
  dom = elements;
  if (inited) return;
  inited = true;

  dom.mode?.addEventListener('change', () => applyMode(dom.mode.value));
  dom.composer?.addEventListener('submit', onSubmit);
  dom.provider?.addEventListener('change', () => loadModels());
  initMention(dom);
  initPreview(dom);
  bindGenMode();
  bindAuthorTabs();
  bindShelf();
  bindNovelDetail();

  applyMode(dom.mode?.value || MODE.READER);
  await loadProviders();
}

function applyMode(mode) {
  const isAuthor = mode === MODE.AUTHOR;
  setHidden(dom.reader, isAuthor);
  setHidden(dom.author, !isAuthor);
  // 侧边栏的作者导航只在作者模式露出
  dom.shell?.querySelector('[data-text-author-nav]')?.classList.toggle('is-hidden', !isAuthor);
  if (!isAuthor) return;
  showAuthorView(authorView);
  if (authorView === 'shelf') loadShelf();
  if (authorView === 'thread') dom.input?.focus();
}

/* ---------- 作者模式内部视图：会话 / 书架 / 详情（导航在侧边栏） ---------- */

function showAuthorView(view) {
  authorView = view;
  setHidden(dom.threadView, view !== 'thread');
  setHidden(dom.shelf, view !== 'shelf');
  setHidden(dom.novelDetail, view !== 'detail');

  const nav = dom.shell?.querySelector('[data-text-author-nav]');
  nav?.classList.remove('is-hidden');
  nav?.querySelectorAll('[data-text-nav]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.textNav === view);
  });
  // 小说操作区只在详情视图露出
  dom.shell?.querySelector('[data-text-novel-actions]')?.classList.toggle('is-hidden', view !== 'detail');
}

function bindAuthorTabs() {
  dom.shell?.querySelectorAll('[data-text-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.textNav;
      showAuthorView(target);
      if (target === 'shelf') loadShelf();
    });
  });
}

function fillOptions(select, items, placeholder) {
  if (!select) return;
  const options = items
    .map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`)
    .join('');
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${options}`;
  select.disabled = !items.length;
}

/** 厂商：当前用户自己配置的那些，TEXT-GENERATE 读库后返回。 */
async function loadProviders() {
  const select = dom.provider;
  if (!select) return;
  try {
    const data = await api('/api/text/providers');
    fillOptions(select, data?.providers || [], '暂无厂商');
  } catch {
    fillOptions(select, [], '厂商加载失败');
  }
  await loadModels();
}

/** 模型：跟着选中的厂商走；没选厂商时清空。 */
async function loadModels() {
  const select = dom.model;
  if (!select) return;
  const provider = dom.provider?.value;
  if (!provider) {
    fillOptions(select, [], '请先选厂商');
    return;
  }
  try {
    const data = await api(`/api/text/models?provider=${encodeURIComponent(provider)}`);
    fillOptions(select, data?.models || [], '暂无模型');
  } catch {
    fillOptions(select, [], '模型加载失败');
  }
}

/** 生成模式按钮：初始为大纲生成，每次点击轮到下一个枚举值。 */
function bindGenMode() {
  const button = dom.genMode;
  if (!button) return;
  button.addEventListener('click', () => {
    const current = Number(button.dataset.genModeIndex || 0);
    applyGenMode((current + 1) % GEN_MODES.length);
  });
  applyGenMode(0);
}

/** 当前枚举回写到 data-gen-mode —— 将来调后端直接读这个属性，不用反解按钮文字。 */
function applyGenMode(index) {
  const button = dom.genMode;
  const mode = GEN_MODES[index];
  button.dataset.genModeIndex = String(index);
  button.dataset.genMode = mode.value;
  button.textContent = mode.label;
}

/** 发送：提交一次生成，然后轮询到出结果。 */
async function onSubmit(event) {
  event.preventDefault();
  if (sending) return;

  const draft = (dom.input?.value || '').trim();
  const provider = dom.provider?.value || '';
  const model = dom.model?.value || '';
  const genMode = dom.genMode?.dataset.genMode || GEN_MODES[0].value;
  const label = dom.genMode?.textContent?.trim() || '生成';

  // 这三样缺一件后端都会退回，先在本地拦下，省一次往返。
  if (!draft) return appendNotice('先写点你想写的东西。');
  if (!provider) return appendNotice('先选一个厂商。');
  if (!model) return appendNotice('先选一个模型。');

  appendMessage('user', '你', draft);
  const bubble = appendMessage('assistant', label, '正在提交…');

  setSending(true);
  try {
    const created = await api('/api/text/tasks', {
      method: 'POST',
      body: JSON.stringify({ provider, model, gen_mode: genMode, draft_text: draft })
    });
    if (dom.input) dom.input.value = '';
    show(bubble, RUNNING_TEXT.pending);
    await pollTask(created?.task_id, bubble);
  } catch (error) {
    show(bubble, error?.message || '提交失败', true);
  } finally {
    setSending(false);
  }
}

/** 轮询任务状态，直到 success / failed 或超时。 */
async function pollTask(taskId, bubble) {
  if (!taskId) return show(bubble, '后端没有返回任务号', true);

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(POLL_INTERVAL_MS);

    let task;
    try {
      task = await api(`/api/text/tasks/${encodeURIComponent(taskId)}`);
    } catch (error) {
      return show(bubble, error?.message || '查询任务失败', true);
    }

    if (task?.status === 'success') {
      // 轮询接口只给 novel_id，正文要再查一次小说（避免每 2 秒搬几 KB 正文）
      const novel = task?.novel_id ? await fetchNovel(task.novel_id) : null;
      show(bubble, novel?.outline_text || '（没有返回内容）');
      if (novel) {
        appendMessage('assistant', '提示', '大纲已存入书架，切到「书架」页签可随时查看、改名或编辑。');
      }
      return;
    }
    if (task?.status === 'failed') {
      return show(bubble, `生成失败：${task.fail_reason || '未写明原因'}`, true);
    }

    show(bubble, `${progressText(task)}\n任务号 ${taskId}`);
  }

  show(bubble, `等待超时，任务仍在处理。任务号 ${taskId}，可稍后在库里按它查看结果。`);
}

/** 用响应里的 subtasks 拼一行进度：第 N/M 步 · 本轮标题（状态）。 */
function progressText(task) {
  const steps = Array.isArray(task?.subtasks) ? task.subtasks : [];
  if (!steps.length) return RUNNING_TEXT[task?.status] || '正在处理…';

  const doneCount = steps.filter((step) => step.status === 'success').length;
  const active = steps.find((step) => step.status !== 'success' && step.status !== 'failed') || steps[steps.length - 1];
  const label = active?.title || active?.subtask_type || '处理中';
  const stateText = active?.status === 'failed'
    ? `失败：${active?.fail_reason || '未写明原因'}`
    : (RUNNING_TEXT[active?.status] || '正在处理…');
  return `第 ${Math.min(doneCount + 1, steps.length)}/${steps.length} 步 · ${label}（${stateText}）`;
}

/** 按 novel_id 取小说正文；失败返回 null，不打断轮询结果展示。 */
async function fetchNovel(novelId) {
  try {
    return await api(`/api/text/novels/${encodeURIComponent(novelId)}`);
  } catch (error) {
    return null;
  }
}

function appendNotice(text) {
  appendMessage('assistant', '提示', text);
}

/** 会话流追加一条。正文经 escapeHtml 转义后进 DOM，不当标记解析。 */
function appendMessage(role, label, text) {
  if (!dom.thread) return null;

  dom.thread.insertAdjacentHTML('beforeend', `
    <div class="text-msg is-${role}">
      <div class="text-msg-role">${escapeHtml(label)}</div>
      <div class="text-msg-body">${escapeHtml(text)}</div>
    </div>`);
  scrollThread();
  return dom.thread.lastElementChild;
}

/** 改写某一条的正文；isError 为真时整条标红。 */
function show(item, text, isError = false) {
  if (!item) return;

  item.classList.toggle('is-error', isError);
  const body = item.querySelector('.text-msg-body');
  if (body) body.textContent = text;
  scrollThread();
}

function scrollThread() {
  if (dom.thread) dom.thread.scrollTop = dom.thread.scrollHeight;
}

/** 提交期间只锁发送按钮：输入框留着，用户可以先把下一段写好。 */
function setSending(value) {
  sending = value;
  if (dom.send) dom.send.disabled = value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ---------- 书架：列表 / 分页 ---------- */

function bindShelf() {
  dom.shelf?.querySelector('[data-text-shelf-refresh]')?.addEventListener('click', () => loadShelf());
  dom.shelf?.querySelector('[data-text-shelf-prev]')?.addEventListener('click', () => {
    if (shelfPage > 1) { shelfPage -= 1; loadShelf(); }
  });
  dom.shelf?.querySelector('[data-text-shelf-next]')?.addEventListener('click', () => {
    if (shelfPage * SHELF_PAGE_SIZE < shelfTotal) { shelfPage += 1; loadShelf(); }
  });
  dom.shelf?.querySelector('[data-text-shelf-list]')?.addEventListener('click', onShelfListClick);
}

async function loadShelf() {
  const list = dom.shelf?.querySelector('[data-text-shelf-list]');
  if (!list) return;

  list.innerHTML = '<p class="text-shelf-empty">加载中…</p>';
  try {
    const data = await api(`/api/text/novels?page=${shelfPage}&page_size=${SHELF_PAGE_SIZE}`);
    shelfTotal = Number(data?.total || 0);
    const items = Array.isArray(data?.items) ? data.items : [];
    renderShelfList(list, items);
  } catch (error) {
    list.innerHTML = `<p class="text-shelf-empty">${escapeHtml(error?.message || '书架加载失败')}</p>`;
  }
  const pageHint = dom.shelf?.querySelector('[data-text-shelf-page]');
  if (pageHint) {
    const lastPage = Math.max(1, Math.ceil(shelfTotal / SHELF_PAGE_SIZE));
    pageHint.textContent = `第 ${shelfPage} / ${lastPage} 页 · 共 ${shelfTotal} 本`;
  }
}

function renderShelfList(list, items) {
  if (!items.length) {
    list.innerHTML = '<p class="text-shelf-empty">书架还是空的。回「会话」写一段草稿，生成的大纲会自动存进来。</p>';
    return;
  }
  list.innerHTML = items.map((item) => `
    <div class="text-shelf-item" data-novel-id="${escapeHtml(item.novel_id)}">
      <button class="text-shelf-open" type="button" data-shelf-action="open" data-novel-id="${escapeHtml(item.novel_id)}">
        <span class="text-shelf-title">${escapeHtml(item.title || '未命名作品')}</span>
        <span class="micro">${escapeHtml(formatTime(item.update_time))}</span>
      </button>
      <button class="text-shelf-delete" type="button" data-shelf-action="delete" data-novel-id="${escapeHtml(item.novel_id)}" title="删除">✕</button>
    </div>`).join('');
}

function formatTime(value) {
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? '' : time.toLocaleString();
}

async function onShelfListClick(event) {
  const button = event.target.closest('[data-shelf-action]');
  if (!button) return;
  const novelId = button.dataset.novelId;
  if (!novelId) return;

  if (button.dataset.shelfAction === 'open') return openNovel(novelId);

  if (button.dataset.shelfAction === 'delete') {
    const novel = button.closest('.text-shelf-item')?.querySelector('.text-shelf-title')?.textContent || '';
    if (!window.confirm(`确定删除《${novel}》？删除后书架不再显示。`)) return;
    try {
      await api(`/api/text/novels/${encodeURIComponent(novelId)}`, { method: 'DELETE' });
      await loadShelf();
    } catch (error) {
      appendMessage('assistant', '提示', error?.message || '删除失败');
    }
  }
}

/* ---------- 小说详情：阅读 / 改名 / 编辑大纲 / 删除 ---------- */

function bindNovelDetail() {
  // 改名 / 编辑 / 删除三个按钮在侧边栏的「小说操作」区
  dom.novelDetail?.querySelector('[data-text-novel-back]')?.addEventListener('click', () => {
    showAuthorView('shelf');
    loadShelf();
  });
  dom.shell?.querySelector('[data-text-novel-rename]')?.addEventListener('click', toggleRenameForm);
  dom.shell?.querySelector('[data-text-novel-edit]')?.addEventListener('click', toggleOutlineForm);
  dom.shell?.querySelector('[data-text-novel-delete]')?.addEventListener('click', deleteCurrentNovel);
  dom.shell?.querySelector('[data-text-novel-regenerate]')?.addEventListener('click', regenerateCurrentNovel);
  dom.novelDetail?.querySelector('[data-text-novel-rename-form]')?.addEventListener('submit', saveNovelTitle);
  dom.novelDetail?.querySelector('[data-text-novel-outline-form]')?.addEventListener('submit', saveNovelOutline);
}

async function openNovel(novelId) {
  const outline = dom.novelDetail?.querySelector('[data-text-novel-outline]');
  if (!outline) return;
  outline.innerHTML = '<p class="text-shelf-empty">加载中…</p>';
  try {
    currentNovel = await api(`/api/text/novels/${encodeURIComponent(novelId)}`);
  } catch (error) {
    outline.innerHTML = '';
    appendMessage('assistant', '提示', error?.message || '小说加载失败');
    return;
  }
  renderNovelDetail();
  showAuthorView('detail');
}

function renderNovelDetail() {
  if (!currentNovel) return;
  const title = dom.novelDetail?.querySelector('[data-text-novel-title]');
  const meta = dom.novelDetail?.querySelector('[data-text-novel-meta]');
  const outline = dom.novelDetail?.querySelector('[data-text-novel-outline]');
  if (title) title.textContent = currentNovel.title || '未命名作品';
  if (meta) meta.textContent = `更新于 ${formatTime(currentNovel.update_time)}`;
  if (outline) outline.innerHTML = mdToHtml(currentNovel.outline_text || '（暂无内容）');
  // 打开详情时收起两块编辑表单，展示阅读态
  dom.novelDetail?.querySelector('[data-text-novel-rename-form]')?.classList.add('is-hidden');
  dom.novelDetail?.querySelector('[data-text-novel-outline-form]')?.classList.add('is-hidden');
}

function toggleRenameForm() {
  const form = dom.novelDetail?.querySelector('[data-text-novel-rename-form]');
  if (!form) return;
  const input = form.querySelector('[data-text-novel-title-input]');
  form.classList.toggle('is-hidden');
  if (!form.classList.contains('is-hidden')) {
    input.value = currentNovel?.title || '';
    input.focus();
  }
  dom.novelDetail?.querySelector('[data-text-novel-outline-form]')?.classList.add('is-hidden');
}

function toggleOutlineForm() {
  const form = dom.novelDetail?.querySelector('[data-text-novel-outline-form]');
  if (!form) return;
  const textarea = form.querySelector('[data-text-novel-outline-input]');
  form.classList.toggle('is-hidden');
  if (!form.classList.contains('is-hidden')) {
    textarea.value = currentNovel?.outline_text || '';
    textarea.focus();
  }
  dom.novelDetail?.querySelector('[data-text-novel-rename-form]')?.classList.add('is-hidden');
}

async function saveNovelTitle(event) {
  event.preventDefault();
  if (!currentNovel) return;
  const input = dom.novelDetail?.querySelector('[data-text-novel-title-input]');
  const title = (input?.value || '').trim();
  if (!title) return appendMessage('assistant', '提示', '小说名称不能为空。');
  try {
    const data = await api(`/api/text/novels/${encodeURIComponent(currentNovel.novel_id)}/title`, {
      method: 'PUT',
      body: JSON.stringify({ title })
    });
    currentNovel.title = data?.title || title;
    renderNovelDetail();
    dom.novelDetail?.querySelector('[data-text-novel-rename-form]')?.classList.add('is-hidden');
  } catch (error) {
    appendMessage('assistant', '提示', error?.message || '改名失败');
  }
}

async function saveNovelOutline(event) {
  event.preventDefault();
  if (!currentNovel) return;
  const textarea = dom.novelDetail?.querySelector('[data-text-novel-outline-input]');
  const outlineText = (textarea?.value || '').trim();
  if (!outlineText) return appendMessage('assistant', '提示', '大纲正文不能为空。');
  try {
    const data = await api(`/api/text/novels/${encodeURIComponent(currentNovel.novel_id)}/outline`, {
      method: 'PUT',
      body: JSON.stringify({ outline_text: outlineText })
    });
    currentNovel.outline_text = data?.outline_text || outlineText;
    if (data?.title) currentNovel.title = data.title;
    renderNovelDetail();
    dom.novelDetail?.querySelector('[data-text-novel-outline-form]')?.classList.add('is-hidden');
  } catch (error) {
    appendMessage('assistant', '提示', error?.message || '保存大纲失败');
  }
}

async function deleteCurrentNovel() {
  if (!currentNovel) return;
  const title = currentNovel.title || '未命名作品';
  if (!window.confirm(`确定删除《${title}》？删除后书架不再显示。`)) return;
  try {
    await api(`/api/text/novels/${encodeURIComponent(currentNovel.novel_id)}`, { method: 'DELETE' });
    currentNovel = null;
    showAuthorView('shelf');
    loadShelf();
  } catch (error) {
    appendMessage('assistant', '提示', error?.message || '删除失败');
  }
}

/** 完全重新生成：用原草稿与引用从零重跑，成功后覆盖当前大纲。 */
async function regenerateCurrentNovel() {
  if (!currentNovel || regenerating) return;

  const title = currentNovel.title || '未命名作品';
  if (!window.confirm(`确定重新生成《${title}》的大纲？\n将使用最初的草稿从零重跑，现有大纲会被覆盖。`)) return;

  regenerating = true;
  const button = dom.shell?.querySelector('[data-text-novel-regenerate]');
  const originalText = button?.textContent || '';
  if (button) { button.disabled = true; button.textContent = '重新生成中…'; }

  try {
    const created = await api(`/api/text/novels/${encodeURIComponent(currentNovel.novel_id)}/regenerate`, { method: 'POST' });
    appendMessage('assistant', '提示', `已开始重新生成《${title}》，完成后大纲自动覆盖。`);

    // 轮询该任务，成功后刷新详情与书架
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await sleep(POLL_INTERVAL_MS);
      let task;
      try {
        task = await api(`/api/text/tasks/${encodeURIComponent(created?.task_id)}`);
      } catch (error) {
        appendMessage('assistant', '提示', error?.message || '查询重新生成进度失败');
        return;
      }
      if (task?.status === 'success') {
        await openNovel(currentNovel.novel_id);
        loadShelf();
        appendMessage('assistant', '提示', '重新生成完成，大纲已覆盖。');
        return;
      }
      if (task?.status === 'failed') {
        appendMessage('assistant', '提示', `重新生成失败：${task.fail_reason || '未写明原因'}`);
        return;
      }
    }
    appendMessage('assistant', '提示', '重新生成仍在进行，稍后刷新书架即可看到新大纲。');
  } catch (error) {
    appendMessage('assistant', '提示', error?.message || '重新生成失败');
  } finally {
    regenerating = false;
    if (button) { button.disabled = false; button.textContent = originalText; }
  }
}

/* ---------- 极简 Markdown 渲染：先整体转义，再按行识别标题 / 引用 / 列表 / 段落 ---------- */

/**
 * 行内标记：**粗体** 与 `代码`。
 * 必须在 escapeHtml 之后调用 —— 此时文本里已无原始 HTML，替换出来的标签是唯一的标签来源。
 */
function inline(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/** 表格行：`|a|b|`；表头分隔行：`|---|:--:|`。 */
const TABLE_ROW = /^\|.*\|$/;
const TABLE_SEP = /^\|\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|$/;

function splitCells(row) {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function mdToHtml(md) {
  const lines = String(md ?? '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  // 'ul' | 'ol' | null —— 有序与无序各开各的，遇到类型切换先收口。
  let listOpen = null;
  const closeList = () => {
    if (listOpen) { out.push(`</${listOpen}>`); listOpen = null; }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const text = escapeHtml(lines[i].trimEnd()).trim();
    if (!text) { closeList(); continue; }

    // 表格：当前行是 |…|，下一行是分隔行 —— 才认成表，避免把竖线当普通段落。
    if (TABLE_ROW.test(text) && i + 1 < lines.length && TABLE_SEP.test(escapeHtml(lines[i + 1].trim()))) {
      closeList();
      const head = splitCells(text).map((cell) => `<th>${inline(cell)}</th>`).join('');
      const rows = [];
      i += 2;
      while (i < lines.length) {
        const body = escapeHtml(lines[i].trimEnd()).trim();
        if (!TABLE_ROW.test(body)) { i -= 1; break; }
        rows.push(`<tr>${splitCells(body).map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`);
        i += 1;
      }
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>`);
      continue;
    }

    // 标题 1~6 级：#### 这类四级标题此前会原样露出井号。
    const heading = text.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      closeList();
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (text.startsWith('&gt; ')) { closeList(); out.push(`<blockquote>${inline(text.slice(5))}</blockquote>`); continue; }
    if (/^(-{3,}|\*{3,})$/.test(text)) { closeList(); out.push('<hr>'); continue; }
    if (text.startsWith('- ')) {
      if (listOpen !== 'ul') { closeList(); out.push('<ul>'); listOpen = 'ul'; }
      out.push(`<li>${inline(text.slice(2))}</li>`);
      continue;
    }
    // 1. / 1) 开头视为有序列表；编号本身丢弃，交给 <ol> 重排。
    const ordered = text.match(/^\d{1,2}[.)]\s+(.*)$/);
    if (ordered) {
      if (listOpen !== 'ol') { closeList(); out.push('<ol>'); listOpen = 'ol'; }
      out.push(`<li>${inline(ordered[1])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inline(text)}</p>`);
  }
  closeList();
  return out.join('\n');
}
