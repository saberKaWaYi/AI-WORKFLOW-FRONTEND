/**
 * 全局常量：系统标识、路由、存储键、展示模式。
 * 这些值此前散落在 router / main / portal / shells 等模块中，此处集中管理。
 */

export const SYSTEM_IDS = {
  DATA: 'data',
  TEXT: 'text',
  IMAGE: 'image',
  VOICE: 'voice',
  VIDEO: 'video',
  ADMIN: 'admin'
};

/** 门户卡片与管理面板的展示顺序：数据 → 四类 AI 任务链 → 管理入口。 */
export const ALL_SYSTEM_IDS = [
  SYSTEM_IDS.DATA,
  SYSTEM_IDS.TEXT,
  SYSTEM_IDS.IMAGE,
  SYSTEM_IDS.VOICE,
  SYSTEM_IDS.VIDEO,
  SYSTEM_IDS.ADMIN
];

/**
 * 详情页在 hash 路由中的路径片段。
 * 注意：保持为 'character' 是为了兼容既有链接与书签，
 * 业务含义上它表示"任意业务节点"（角色 / SCP 项目等），
 * 若要统一命名，只需修改此常量。
 */
export const NODE_ROUTE_SEGMENT = 'character';

export const DETAIL_SOURCE_VIEWS = {
  CARDS: 'cards',
  GRAPH: 'graph'
};

export const DISPLAY_TYPES = {
  CARDS: 'cards',
  GRAPH: 'graph'
};

export const LANGUAGES = {
  ZH: 'zh',
  EN: 'en'
};

export const STORAGE_KEYS = {
  ENTRY_SYSTEM: 'entrySystem',
  DETAIL_SOURCE_VIEW: 'ai-workflow-detail-source',
  DATA_STATE: 'ai-workflow-data-state'
};
