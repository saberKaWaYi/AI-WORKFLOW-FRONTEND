import { SYSTEMS } from '../auth/portal.js';
import { state } from '../core/state.js';
import { renderUsersPanel } from './admin/users.js';

const SHELL_CLASSES = ['shell-data', 'shell-text', 'shell-video', 'shell-admin'];

function createShell(systemId, { shellClass, greetingFallback = '访客', onRender } = {}) {
  let dom = {};
  const system = SYSTEMS[systemId];

  return {
    init(elements) {
      dom = elements;
    },
    render() {
      dom.shell?.classList.remove('is-hidden');
      dom.shell?.classList.add(shellClass);
      SHELL_CLASSES.filter((name) => name !== shellClass).forEach((name) => dom.shell?.classList.remove(name));
      if (dom.title) dom.title.textContent = system.title;
      if (dom.subtitle) dom.subtitle.textContent = system.subtitle;
      if (dom.greeting) dom.greeting.textContent = `你好，${state.user.displayName}`;
      dom.main?.classList.remove('is-hidden');
      onRender?.(dom);
    },
    hide() {
      dom.shell?.classList.add('is-hidden');
      dom.main?.classList.add('is-hidden');
    }
  };
}

const text = createShell('text', { shellClass: 'shell-text' });
const video = createShell('video', { shellClass: 'shell-video' });
const admin = createShell('admin', {
  shellClass: 'shell-admin',
  onRender: (dom) => renderUsersPanel(dom.main, state.user)
});

export const initTextShell = text.init;
export const renderTextShell = text.render;
export const hideTextShell = text.hide;
export const initVideoShell = video.init;
export const renderVideoShell = video.render;
export const hideVideoShell = video.hide;
export const initAdminShell = admin.init;
export const renderAdminShell = admin.render;
export const hideAdminShell = admin.hide;
