/**
 * @ 引用：世界观与人物。
 *
 * 语义由文本自身承载，前端不维护额外的引用映射 —— `@pcr` 引用世界观，
 * `@pcr/雪之下雪乃` 引用该世界观下的人物，插入的就是这段纯文本，后端自行解析。
 *
 * 取数走数据基座，按候选数量选接口：
 *   只输入 `@`        -> /api/nodes/list   （世界观候选）
 *   输入 `@pcr`       -> /api/nodes/list   （过滤出世界观）
 *   输入 `@pcr/雪`    -> /api/nodes/search （模糊搜索该世界观下的人物）
 */
import { api } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

// `@` 后面允许有空白，斜杠两侧也允许，用户手打 `@ pcr / 雪` 也算数。
// 斜杠段必须整体匹配，否则 `@` 后的空白会被误当成"已进入节点段"。
const MENTION_PATTERN = /@\s*([^\s@/]*)\s*(?:\/\s*([^\s@/]*))?$/;
// 邮箱、邮箱式后缀不该触发；`@` 紧跟在非空白字符（含另一个 `@`）后一律不算引用。
const NOT_MENTION = /[^\s]/;
const MAX_ITEMS = 30;

let dom = {};
let items = [];
let activeIndex = -1;
let requestSeq = 0;
let cache = new Map();
let bound = false;
let isComposing = false;
// 已把本次输入推迟到下一帧处理，避免 compositionend 后的那次 input 重复触发。
let composing = false;

export function initMention(elements) {
  dom = elements;
  if (bound || !dom.input || !dom.mention) return;
  bound = true;

  dom.input.addEventListener('input', onInput);
  dom.input.addEventListener('click', onInput);
  dom.input.addEventListener('keydown', onKeyDown);
  dom.input.addEventListener('blur', () => close());
  dom.input.addEventListener('compositionstart', () => { isComposing = true; });
  dom.input.addEventListener('compositionend', () => { isComposing = false; });
  dom.mention.addEventListener('mousedown', (event) => event.preventDefault());
  dom.mention.addEventListener('click', onMenuClick);
}

function onInput() {
  // compositionend 后浏览器还会补一次 input，此时读 selectionStart 会踩到
  // setComposingRange 留下的旧选区，导致插入区间算短一位（`@pcr` 变成 `@cr`）。
  // 中文输入在这一步是常态，推迟一帧等选区落定再算。
  if (isComposing || dom.input.composing) {
    composing = true;
    queueMicrotask(() => {
      composing = false;
      const context = readContext();
      if (!context) return close();
      refresh(context);
    });
    return;
  }
  const context = readContext();
  if (!context) return close();
  refresh(context);
}

function readContext() {
  const caret = dom.input.selectionStart;
  if (caret == null) return null;
  const before = dom.input.value.slice(0, caret);
  const match = before.match(MENTION_PATTERN);
  if (!match) return null;

  // `@` 前面贴着非空白字符（如 email@host）不算引用，避免邮箱被当成世界观名。
  const start = caret - match[0].length;
  if (start > 0 && NOT_MENTION.test(before[start - 1])) return null;

  // 只有真正打出了斜杠才进入节点段。不能靠 keyword 是否为空来判断 ——
  // `@pcr/` 与 `@pcr` 的 keyword 都是空串，但一个是节点列表、一个是世界观列表。
  const hasSlash = match[0].includes('/');
  return {
    start,
    caret,
    business: match[1],
    // null 表示「还在选世界观」，空串表示「已进入节点段但还没输入关键词」。
    keyword: hasSlash ? (match[2] ?? '') : null
  };
}

async function refresh(context) {
  const token = ++requestSeq;
  const hasNodeQuery = context.keyword !== null;
  // 缓存键必须能区分「世界观段」与「刚打完斜杠的节点段」：
  // 两者 business 都是 pcr、关键词都是空，只按 business|keyword 拼会撞成同一个键，
  // 导致 `@pcr/` 直接命中 `@pcr` 的缓存、弹出世界观列表。
  const kind = hasNodeQuery ? 'node' : 'world';
  const key = `${kind}|${context.business}|${hasNodeQuery ? context.keyword : ''}`;

  if (cache.has(key)) {
    render(cache.get(key), context);
    return;
  }

  showStatus('加载中…');
  let list = [];
  try {
    list = hasNodeQuery
      ? await fetchNodes(context.business, context.keyword)
      : await fetchBusinesses(context.business);
  } catch (error) {
    if (token !== requestSeq) return;
    showStatus(error.message || '引用列表加载失败');
    return;
  }
  if (token !== requestSeq) return;
  cache.set(key, list);
  render(list, context);
}

/** `@` 或 `@pcr` 阶段：世界观候选，本地过滤不打扰后端。 */
async function fetchBusinesses(business) {
  const result = await api('/api/businesses');
  const all = Array.isArray(result?.businesses) ? result.businesses : [];
  const keyword = business.toLowerCase();
  const filtered = keyword ? all.filter((name) => name.toLowerCase().includes(keyword)) : all;
  // hint 必须与 toItem 同构（`@业务名`），pick() 统一按「去掉首个字符」取引用文本。
  return filtered.map((name) => ({ value: name, label: `${name} （世界观）`, hint: `@${name}` }));
}

/**
 * `@pcr/…` 阶段：该世界观下的人物。
 * 关键词为空时用列表接口拿全量（模糊搜索接口不接受空关键词），有输入才转模糊搜索。
 */
async function fetchNodes(business, keyword) {
  const query = keyword.trim();
  const result = query
    ? await api(`/api/nodes/search?${new URLSearchParams({ business_name: business, keyword: query })}`)
    : await api(`/api/nodes/list?${new URLSearchParams({ business_name: business })}`);
  const nodes = Array.isArray(result?.data) ? result.data : [];
  if (!query) return nodes.map((node) => toItem(business, node));
  // 模糊搜索接口只保证「包含」，精确前缀仍优先，故按前缀命中排前。
  const prefix = nodes.filter((node) => matchesPrefix(node, query));
  const rest = nodes.filter((node) => !matchesPrefix(node, query));
  return [...prefix, ...rest].map((node) => toItem(business, node));
}

function matchesPrefix(node, keyword) {
  const lower = keyword.toLowerCase();
  return [node.name_zh, node.name_en, node.key]
    .some((field) => String(field || '').toLowerCase().startsWith(lower));
}

function toItem(business, node) {
  const key = String(node.key || '').trim();
  const nameZh = String(node.name_zh || '').trim();
  const nameEn = String(node.name_en || '').trim();
  const alias = [nameZh, nameEn].filter(Boolean).join(' / ');
  return {
    value: key,
    label: alias ? `${alias} （${key}）` : key,
    hint: `@${business}/${key}`
  };
}

function openMenu(context) {
  dom.mention.classList.remove('is-hidden');
  dom.mentionContext = context;
}

function render(list, context) {
  items = list.slice(0, MAX_ITEMS);
  activeIndex = items.length ? 0 : -1;
  if (!items.length) {
    showStatus('没有匹配的引用');
    return;
  }
  dom.mention.innerHTML = items
    .map((item, index) => `
      <button class="text-mention-item${index === activeIndex ? ' is-active' : ''}" type="button" data-mention-index="${index}">
        <span class="text-mention-label">${escapeHtml(item.label)}</span>
        <span class="text-mention-hint">${escapeHtml(item.hint)}</span>
      </button>
    `)
    .join('');
  openMenu(context);
}

function showStatus(text) {
  items = [];
  activeIndex = -1;
  dom.mention.innerHTML = `<div class="text-mention-empty">${escapeHtml(text)}</div>`;
  dom.mention.classList.remove('is-hidden');
}

function close() {
  requestSeq += 1;
  items = [];
  activeIndex = -1;
  dom.mention.classList.add('is-hidden');
}

function onMenuClick(event) {
  const button = event.target.closest('[data-mention-index]');
  if (!button) return;
  pick(Number(button.dataset.mentionIndex));
}

function onKeyDown(event) {
  if (dom.mention.classList.contains('is-hidden') || !items.length) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : items.length - 1;
    activeIndex = (activeIndex + step) % items.length;
    syncActive();
    return;
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault();
    // 输入法组字中的回车是「确认候选词」，不是「选中引用」，不能抢。
    if (isComposing) return;
    // 重新读一次真实上下文，不信任可能已过期的缓存值。
    pick(activeIndex, readContext() || dom.mentionContext);
    return;
  }
  if (event.key === 'Escape') close();
}

function syncActive() {
  dom.mention.querySelectorAll('[data-mention-index]').forEach((el) => {
    el.classList.toggle('is-active', Number(el.dataset.mentionIndex) === activeIndex);
  });
}

function pick(index, context = dom.mentionContext) {
  const item = items[index];
  if (!item || !context) return;

  // 用完整引用文本替换掉正在输入的 `@…` 片段，光标落在末尾。
  const value = dom.input.value;
  // 替换区间向右校验一遍：斜杠段若因输入法未落定而算短了，这里把它补全，
  // 否则 `/` 会被夹在引用中间，既显示不对、语义也废了。
  let end = context.caret;
  while (end < value.length && /[^\s@/]/.test(value[end])) end += 1;
  if (value[end] === '/') {
    end += 1;
    while (end < value.length && /[^\s@/]/.test(value[end])) end += 1;
  }

  const insertion = `${item.hint.startsWith('@') ? item.hint : `@${item.hint}`} `;
  dom.input.value = value.slice(0, context.start) + insertion + value.slice(end);
  const caret = context.start + insertion.length;
  dom.input.setSelectionRange(caret, caret);
  close();
  dom.input.focus();
}
