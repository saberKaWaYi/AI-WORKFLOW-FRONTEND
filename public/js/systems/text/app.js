import { setHidden } from '../../core/dom.js';
import { api } from '../../core/api.js';
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

  applyMode(dom.mode?.value || MODE.READER);
  await loadProviders();
}

function applyMode(mode) {
  const isAuthor = mode === MODE.AUTHOR;
  setHidden(dom.reader, isAuthor);
  setHidden(dom.author, !isAuthor);
  if (isAuthor) dom.input?.focus();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
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

    if (task?.status === 'success') return show(bubble, task.result_text || '（没有返回内容）');
    if (task?.status === 'failed') {
      return show(bubble, `生成失败：${task.fail_reason || '未写明原因'}`, true);
    }

    show(bubble, `${RUNNING_TEXT[task?.status] || '正在处理…'}（任务号 ${taskId}）`);
  }

  show(bubble, `等待超时，任务仍在处理。任务号 ${taskId}，可稍后在库里按它查看结果。`);
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
