import { setHidden } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { initMention } from './mention.js';
import { initPreview } from './preview.js';

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

// 生成模式：底部胶囊按钮的枚举值，点一下轮到下一个。
// value 是将来传给 TEXT-GENERATE 的字段值，label 只负责显示在按钮上。
const GEN_MODES = [
  { value: 'outline', label: '大纲生成' },
  { value: 'content', label: '正文生成' }
];

let dom = {};
let inited = false;

export async function initTextApp(elements) {
  dom = elements;
  if (inited) return;
  inited = true;

  dom.mode?.addEventListener('change', () => applyMode(dom.mode.value));
  dom.composer?.addEventListener('submit', (event) => event.preventDefault());
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
