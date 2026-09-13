import { ALL_SYSTEM_IDS, NODE_ROUTE_SEGMENT, STORAGE_KEYS, SYSTEM_IDS } from './constants.js';

const listeners = new Set();

export const ROUTE_PAGES = {
  MAIN: 'main',
  DETAIL: 'detail',
  STORIES: 'stories',
  STORY: 'story'
};

const STORY_ROUTE_SEGMENT = 'story';
const STORIES_ROUTE_SEGMENT = 'stories';

const KNOWN_SYSTEMS = new Set(ALL_SYSTEM_IDS);

/**
 * 解析 hash 路由。
 * 形如：#/data 、 #/data/character/<节点 id> 、 #/admin
 */
export function parseRoute() {
  const parts = location.hash.replace(/^#/, '').split('/').filter(Boolean);
  if (!parts.length) throw new Error('缺少路由');

  const [system, page, ...rest] = parts;
  if (!KNOWN_SYSTEMS.has(system)) throw new Error(`未知路由: ${location.hash}`);

  if (system === SYSTEM_IDS.DATA && page === NODE_ROUTE_SEGMENT && rest.length) {
    return { system, page: ROUTE_PAGES.DETAIL, nodeId: decodeURIComponent(rest.join('/')) };
  }
  if (system === SYSTEM_IDS.DATA && page === STORIES_ROUTE_SEGMENT) {
    return { system, page: ROUTE_PAGES.STORIES };
  }
  if (system === SYSTEM_IDS.DATA && page === STORY_ROUTE_SEGMENT && rest.length) {
    return { system, page: ROUTE_PAGES.STORY, storyKey: decodeURIComponent(rest.join('/')) };
  }
  return { system, page: ROUTE_PAGES.MAIN };
}

export function navigate(path) {
  location.hash = path.startsWith('#') ? path : `#${path}`;
}

export function navigateToDetail(nodeId, sourceView = '') {
  if (sourceView) sessionStorage.setItem(STORAGE_KEYS.DETAIL_SOURCE_VIEW, sourceView);
  navigate(`/${SYSTEM_IDS.DATA}/${NODE_ROUTE_SEGMENT}/${encodeURIComponent(nodeId)}`);
}

export function navigateToDataMain() {
  navigate(`/${SYSTEM_IDS.DATA}`);
}

export function navigateToStory(storyKey) {
  navigate(`/${SYSTEM_IDS.DATA}/${STORY_ROUTE_SEGMENT}/${encodeURIComponent(storyKey)}`);
}

export function navigateToStories() {
  navigate(`/${SYSTEM_IDS.DATA}/${STORIES_ROUTE_SEGMENT}`);
}

export function onRouteChange(callback) {
  listeners.add(callback);
}

export function initRouter() {
  window.addEventListener('hashchange', () => listeners.forEach((fn) => fn(parseRoute())));
}
