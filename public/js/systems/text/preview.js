/**
 * 输入预览：把文本框里的 `@` 引用渲染成可点击的跳转链接。
 *
 * 为什么不直接改输入框：textarea 只能放纯文本，塞不进 <a>。
 * 换成 contenteditable 就要重写输入法、选区、删字整套逻辑（前面两个 bug 都在那片雷区）。
 * 所以保持输入框原样，在它上方另起一块只读预览，专管「看得见、点得动」。
 *
 * 引用形态：
 *   @pcr         -> 数据展示系统，pcr 业务首页
 *   @pcr/七七香   -> pcr 业务下的节点详情页
 */
import { escapeHtml } from '../../core/utils.js';
import { navigateToBusiness, navigateToNodeInBusiness } from '../../core/router.js';

// 与 mention.js 的 MENTION_PATTERN 同源：`@业务` 或 `@业务/节点`。
// 这里用全局匹配把整段文本里的所有引用都找出来，所以要带 g。
const REF_PATTERN = /@([^\s@/]+)(?:\/([^\s@/]+))?/g;

let dom = {};
let bound = false;

export function initPreview(elements) {
  dom = elements;
  if (bound || !dom.input || !dom.preview) return;
  bound = true;

  dom.input.addEventListener('input', render);
  // 引用是提交给后端的内容，点击仅用于「看一眼」，因此不阻止默认行为，
  // 而是接管 click 自己跳转 —— 顺带避免预览层的点击把光标从输入框抢走。
  dom.preview.addEventListener('click', onPreviewClick);
}

function onPreviewClick(event) {
  const link = event.target.closest('[data-ref-target]');
  if (!link) return;
  event.preventDefault();
  location.hash = link.dataset.refTarget.startsWith('#')
    ? link.dataset.refTarget
    : `#${link.dataset.refTarget}`;
}

function render() {
  const text = dom.input.value;
  // 没有引用时不显示：预览条只用来"点引用"，没引用就是纯占位。
  if (!text.trim() || !REF_PATTERN.test(text)) {
    REF_PATTERN.lastIndex = 0;
    dom.preview.classList.add('is-hidden');
    dom.preview.innerHTML = '';
    return;
  }
  REF_PATTERN.lastIndex = 0;

  dom.preview.innerHTML = toHtml(text);
  dom.preview.classList.remove('is-hidden');
}

/** 把纯文本转成「转义后的文本 + 引用链接」的 HTML。 */
export function toHtml(text) {
  let html = '';
  let cursor = 0;

  for (const match of String(text).matchAll(REF_PATTERN)) {
    const [raw, business, node] = match;
    // `@` 紧贴非空白字符时不算引用（如邮箱），跳过。
    const prev = text[match.index - 1];
    if (match.index > 0 && prev && !/\s/.test(prev)) continue;

    html += escapeHtml(text.slice(cursor, match.index));
    html += renderRef(raw, business, node);
    cursor = match.index + raw.length;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

function renderRef(raw, business, node) {
  const target = node
    ? navigateToNodeInBusiness(business, node)
    : navigateToBusiness(business);
  const title = node
    ? `打开 ${business} 下的「${node}」详情页`
    : `打开数据展示系统的 ${business}`;

  return `<a class="text-ref" href="#${escapeHtml(target)}" data-ref-target="${escapeHtml(target)}" title="${escapeHtml(title)}">${escapeHtml(raw)}</a>`;
}
