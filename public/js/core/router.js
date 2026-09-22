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
  const [pathPart, queryPart] = location.hash.replace(/^#/, '').split('?');
  const parts = pathPart.split('/').filter(Boolean);
  if (!parts.length) throw new Error('缺少路由');

  // `?biz=` 用于跨系统跳转时带上目标业务：数据系统据此先切好数据源，
  // 否则详情页会拿旧的 dataSource 去查，直接 404。老链接不带该参数，行为不变。
  const business = new URLSearchParams(queryPart || '').get('biz') || '';

  const [system, page, ...rest] = parts;
  if (!KNOWN_SYSTEMS.has(system)) throw new Error(`未知路由: ${location.hash}`);

  if (system === SYSTEM_IDS.DATA && page === NODE_ROUTE_SEGMENT && rest.length) {
    return { system, page: ROUTE_PAGES.DETAIL, nodeId: decodeURIComponent(rest.join('/')), business };
  }
  if (system === SYSTEM_IDS.DATA && page === STORIES_ROUTE_SEGMENT) {
    return { system, page: ROUTE_PAGES.STORIES, business };
  }
  if (system === SYSTEM_IDS.DATA && page === STORY_ROUTE_SEGMENT && rest.length) {
    return { system, page: ROUTE_PAGES.STORY, storyKey: decodeURIComponent(rest.join('/')), business };
  }
  return { system, page: ROUTE_PAGES.MAIN, business };
}

export function navigate(path) {
  location.hash = path.startsWith('#') ? path : `#${path}`;
}

export function navigateToDetail(nodeId, sourceView = '') {
  if (sourceView) sessionStorage.setItem(STORAGE_KEYS.DETAIL_SOURCE_VIEW, sourceView);
  navigate(`/${SYSTEM_IDS.DATA}/${NODE_ROUTE_SEGMENT}/${encodeURIComponent(nodeId)}`);
}

/**
 * 跨系统跳到某业务下的节点详情页。
 *
 * 带 `?biz=` 是必须的：详情接口按 `state.dataSource` 查库，
 * 只给 nodeId 的话数据系统会拿当前（很可能是别的）业务去查，必然查不到。
 */
export function navigateToNodeInBusiness(business, nodeId) {
  const query = business ? `?biz=${encodeURIComponent(business)}` : '';
  return `/${SYSTEM_IDS.DATA}/${NODE_ROUTE_SEGMENT}/${encodeURIComponent(nodeId)}${query}`;
}

/** 跨系统跳到数据展示首页并选中某业务。 */
export function navigateToBusiness(business) {
  const query = business ? `?biz=${encodeURIComponent(business)}` : '';
  return `/${SYSTEM_IDS.DATA}${query}`;
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
