const listeners = new Set();

export function parseRoute() {
  const parts = location.hash.replace(/^#/, '').split('/').filter(Boolean);
  if (!parts.length) throw new Error('缺少路由');

  if (parts[0] === 'data' && parts[1] === 'character' && parts[2]) {
    return { system: 'data', page: 'detail', characterId: decodeURIComponent(parts.slice(2).join('/')) };
  }
  if (parts[0] === 'data') return { system: 'data', page: 'main' };
  if (parts[0] === 'text') return { system: 'text', page: 'main' };
  if (parts[0] === 'video') return { system: 'video', page: 'main' };
  if (parts[0] === 'admin') return { system: 'admin', page: 'main' };
  throw new Error(`未知路由: ${location.hash}`);
}

export function navigate(path) {
  location.hash = path.startsWith('#') ? path : `#${path}`;
}

export function navigateToDetail(characterId, sourceView = '') {
  if (sourceView) sessionStorage.setItem('ai-workflow-detail-source', sourceView);
  navigate(`/data/character/${encodeURIComponent(characterId)}`);
}

export function navigateToDataMain() {
  navigate('/data');
}

export function onRouteChange(callback) {
  listeners.add(callback);
}

export function initRouter() {
  window.addEventListener('hashchange', () => listeners.forEach((fn) => fn(parseRoute())));
}
