/**
 * 「渲染」按钮：把输入框里的草稿交给 AI 扩充，结果直接替换输入框内容。
 *
 * 当前阶段后端渲染接口还没接，先用本地占位实现把交互跑通，
 * 真调用到位后只需替换 requestExpansion() 一个函数。
 */

let dom = {};
let bound = false;
let busy = false;

export function initRenderAction(elements) {
  dom = elements;
  if (bound || !dom.render) return;
  bound = true;

  dom.render.addEventListener('click', () => { void run(); });
  syncEnabled();
}

/** 空输入时置灰。跟随 input 事件，所以也由 preview 那条输入监听驱动。 */
export function syncEnabled() {
  if (!dom.render || busy) return;
  dom.render.disabled = !(dom.input?.value || '').trim();
}

async function run() {
  if (busy) return;

  const draft = (dom.input?.value || '').trim();
  if (!draft) return;

  busy = true;
  dom.render.disabled = true;
  dom.render.classList.add('is-busy');
  dom.render.setAttribute('data-tip', '渲染中…');

  try {
    // 完全替换：只留 AI 产出的正文，草稿不再保留。
    dom.input.value = await requestExpansion(draft);
    // 手动派发 input：程序化赋值不触发该事件，预览条与按钮态都不会自己更新。
    dom.input.dispatchEvent(new Event('input', { bubbles: true }));
  } finally {
    busy = false;
    dom.render.classList.remove('is-busy');
    dom.render.setAttribute('data-tip', 'AI渲染');
    syncEnabled();
  }
}

/** TODO 待接入文本生成系统的渲染接口，现在返回占位正文。 */
async function requestExpansion(draft) {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return `【占位正文】这里是 AI 依据草稿（${draft.length} 字）渲染出的内容，接入渲染接口后替换。`;
}
