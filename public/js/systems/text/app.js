import { setHidden } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { initMention } from './mention.js';
import { initPreview } from './preview.js';
import { initRenderAction, syncEnabled } from './render-action.js';

/**
 * 文本 AI 任务链入口。
 *
 * 两种模式共用一个外壳，靠侧边栏的下拉框切换，只改可见性、不持久化：
 *   reader  读者模式 —— 占位「还在开发中」
 *   author  作者模式 —— 底部对话框（当前只有空壳，提交暂不接任何逻辑）
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

let dom = {};
let inited = false;

export async function initTextApp(elements) {
  dom = elements;
  if (inited) return;
  inited = true;

  dom.mode?.addEventListener('change', () => applyMode(dom.mode.value));
  dom.composer?.addEventListener('submit', (event) => event.preventDefault());
  // 「渲染」按钮的可用态要跟着输入内容走，挂在这里而不是塞进 preview.js。
  dom.input?.addEventListener('input', syncEnabled);
  dom.provider?.addEventListener('change', () => loadModels());
  initMention(dom);
  initPreview(dom);
  initRenderAction(dom);

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
