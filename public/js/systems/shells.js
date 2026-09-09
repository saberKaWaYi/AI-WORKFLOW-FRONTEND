import { SYSTEM_IDS } from '../core/constants.js';
import { SYSTEMS } from '../auth/portal.js';
import { state } from '../core/state.js';
import { hideElement, showElement } from '../core/dom.js';
import { renderUsersPanel } from './admin/users.js';

const SHELL_CLASS_BY_SYSTEM = {
  [SYSTEM_IDS.TEXT]: 'shell-text',
  [SYSTEM_IDS.VIDEO]: 'shell-video',
  [SYSTEM_IDS.IMAGE]: 'shell-image',
  [SYSTEM_IDS.VOICE]: 'shell-voice',
  [SYSTEM_IDS.ADMIN]: 'shell-admin'
};

const ALL_SHELL_CLASSES = Object.values(SHELL_CLASS_BY_SYSTEM);

/** 各系统的 DOM 键名映射：语义别名 -> 全局 dom 中的键名。 */
const SHELL_DOM_MAPPING = {
  [SYSTEM_IDS.TEXT]: {
    shell: 'textShell',
    main: 'textMain',
    title: 'textTitle',
    subtitle: 'textSubtitle',
    greeting: 'textGreeting'
  },
  [SYSTEM_IDS.VIDEO]: {
    shell: 'videoShell',
    main: 'videoMain',
    title: 'videoTitle',
    subtitle: 'videoSubtitle',
    greeting: 'videoGreeting'
  },
  [SYSTEM_IDS.IMAGE]: {
    shell: 'imageShell',
    main: 'imageMain',
    title: 'imageTitle',
    subtitle: 'imageSubtitle',
    greeting: 'imageGreeting'
  },
  [SYSTEM_IDS.VOICE]: {
    shell: 'voiceShell',
    main: 'voiceMain',
    title: 'voiceTitle',
    subtitle: 'voiceSubtitle',
    greeting: 'voiceGreeting'
  },
  [SYSTEM_IDS.ADMIN]: {
    shell: 'adminShell',
    main: 'adminMain',
    title: 'adminTitle',
    subtitle: 'adminSubtitle',
    greeting: 'adminGreeting'
  }
};

/** 所有外壳元素，用于整体隐藏（data 外壳由数据系统自行管理）。 */
const ALL_SHELL_DOM_KEYS = [
  'dataShell',
  'textShell',
  'videoShell',
  'imageShell',
  'voiceShell',
  'adminShell'
];

function createShell(systemId, onRender) {
  let dom = {};
  const system = SYSTEMS[systemId];
  const shellClass = SHELL_CLASS_BY_SYSTEM[systemId];

  return {
    init(elements) {
      dom = elements;
    },

    render() {
      showElement(dom.main);
      applyShellClass();
      if (dom.title) dom.title.textContent = system.title;
      if (dom.subtitle) dom.subtitle.textContent = system.subtitle;
      if (dom.greeting) dom.greeting.textContent = `你好，${state.user.displayName}`;
      onRender?.(dom);
    },

    hide() {
      hideElement(dom.shell);
      hideElement(dom.main);
    }
  };

  function applyShellClass() {
    if (!dom.shell) return;
    ALL_SHELL_CLASSES.filter((name) => name !== shellClass).forEach((name) => dom.shell.classList.remove(name));
    dom.shell.classList.add(shellClass);
    showElement(dom.shell);
  }
}

const shells = {
  [SYSTEM_IDS.TEXT]: createShell(SYSTEM_IDS.TEXT),
  [SYSTEM_IDS.VIDEO]: createShell(SYSTEM_IDS.VIDEO),
  [SYSTEM_IDS.IMAGE]: createShell(SYSTEM_IDS.IMAGE),
  [SYSTEM_IDS.VOICE]: createShell(SYSTEM_IDS.VOICE),
  [SYSTEM_IDS.ADMIN]: createShell(SYSTEM_IDS.ADMIN, (shellDom) => renderUsersPanel(shellDom.main, state.user))
};

let allShellElements = [];

export function initShells(dom) {
  for (const [systemId, mapping] of Object.entries(SHELL_DOM_MAPPING)) {
    const elements = Object.fromEntries(
      Object.entries(mapping).map(([alias, domKey]) => [alias, dom[domKey]])
    );
    shells[systemId].init(elements);
  }
  allShellElements = ALL_SHELL_DOM_KEYS.map((key) => dom[key]);
}

/** 渲染指定系统的外壳（数据系统由 app.js 自行接管，不在此列）。 */
export function renderShell(systemId) {
  shells[systemId]?.render();
}

/** 隐藏全部外壳及其内容区，用于切换系统、进入或退出应用。 */
export function hideAllShells() {
  allShellElements.forEach(hideElement);
  Object.values(shells).forEach((shell) => shell.hide());
}
