import { setHidden } from '../../core/dom.js';
import { initMention } from './mention.js';
import { initPreview } from './preview.js';
import { initRenderAction, syncEnabled } from './render-action.js';

/**
 * 文本 AI 任务链入口。
 *
 * 两种模式共用一个外壳，靠侧边栏的下拉框切换，只改可见性、不持久化：
 *   reader  读者模式 —— 占位「还在开发中」
 *   author  作者模式 —— 底部对话框（当前只有空壳，提交暂不接任何逻辑）
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
  initMention(dom);
  initPreview(dom);
  initRenderAction(dom);

  applyMode(dom.mode?.value || MODE.READER);
}

function applyMode(mode) {
  const isAuthor = mode === MODE.AUTHOR;
  setHidden(dom.reader, isAuthor);
  setHidden(dom.author, !isAuthor);
  if (isAuthor) dom.input?.focus();
}
