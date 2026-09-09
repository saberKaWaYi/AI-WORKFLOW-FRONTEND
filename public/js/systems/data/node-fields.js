/**
 * 节点字段取值工具。
 *
 * 数据约定：mongo / nebula 中的多语言字段均以 `{ 字段名_zh, 字段名_en }` 形式存储。
 * 本模块集中处理这些字段的取值与语言降级，避免各视图重复实现。
 */
import { DATA_TEXT } from '../../core/state.js';
import { LANGUAGES } from '../../core/constants.js';

const OTHER_LANGUAGE = {
  [LANGUAGES.ZH]: LANGUAGES.EN,
  [LANGUAGES.EN]: LANGUAGES.ZH
};

export function otherLanguage(lang) {
  return OTHER_LANGUAGE[lang] || LANGUAGES.ZH;
}

// ---------- 节点名称 ----------

export function getName(node, lang) {
  const props = node?.properties || {};
  return props[`name_${lang}`] || props.name_en || node?.vid || DATA_TEXT.unknown;
}

export function getOtherName(node, lang) {
  return node?.properties?.[`name_${otherLanguage(lang)}`] || node?.vid || '';
}

export function compareNodes(a, b, lang) {
  const locale = lang === LANGUAGES.ZH ? 'zh-Hans-CN' : 'en';
  return getName(a, lang).localeCompare(getName(b, lang), locale);
}

// ---------- 关系（边）文案 ----------

/** 取指定语言的关系文案，不做语言降级。 */
export function pickEdgeText(edge, lang) {
  const props = edge?.properties || {};
  return props[`content_${lang}`] || props[`title_${lang}`] || '';
}

/**
 * 取关系文案并逐级降级：指定语言 -> 备用语言 -> 边 id。
 * 用于生成稳定的去重键，避免同一条关系因某语言缺失而被算作多条。
 */
export function pickEdgeTextWithFallback(edge, lang, fallbackLang = LANGUAGES.EN) {
  return pickEdgeText(edge, lang) || pickEdgeText(edge, fallbackLang) || edge?.id || '';
}

export function getRelationText(edge, lang) {
  return pickEdgeText(edge, lang);
}

export function edgeEndpoint(edge, side, lang) {
  return edge?.properties?.[`${side}_name_${lang}`] || edge?.[`${side}_id`] || '';
}

// ---------- 本地化字段块 ----------

/** 取字符串型本地化字段，如 `{ summary_zh, summary_en }`。 */
export function pickLocalized(data, field, lang) {
  const block = data?.[field];
  if (!block || typeof block !== 'object') return '';
  return block[`${field}_${lang}`] || block[`${field}_en`] || block[`${field}_zh`] || '';
}

/** 取对象型本地化字段，如 characteristics -> `{ abilities, appearance, ... }`。 */
export function pickLocalizedObject(data, field, lang) {
  const block = data?.[field];
  if (!block || typeof block !== 'object') return null;
  const candidates = [block[`${field}_${lang}`], block[`${field}_zh`], block[`${field}_en`]];
  return candidates.find((item) => item && typeof item === 'object' && !Array.isArray(item)) || null;
}

/** 取数组型本地化字段，如 incidents -> `[{ title, content }]`。 */
export function pickLocalizedList(data, field, lang) {
  const block = data?.[field];
  if (!block || typeof block !== 'object') return [];
  const candidates = [
    block[`${field}_${lang}`],
    block[`${field}_zh`],
    block[`${field}_en`]
  ];
  return candidates.find((item) => Array.isArray(item) && item.length)
    || candidates.find((item) => Array.isArray(item))
    || [];
}

/** 取本地化字段的原始值（不限定类型），供自动推断渲染方式。 */
export function pickLocalizedRaw(data, field, lang) {
  const block = data?.[field];
  if (!block || typeof block !== 'object') return null;
  return block[`${field}_${lang}`] ?? block[`${field}_zh`] ?? block[`${field}_en`] ?? null;
}

/** 判断字段是否为 `{ 字段名_zh, 字段名_en }` 形式的本地化块。 */
export function isLocalizedBlock(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return `${field}_zh` in value || `${field}_en` in value;
}

// ---------- 图片 ----------

/** 从图片条目中取可用地址，兼容 `{ png }`、`{ gif }`、`{ url }` 三种形态。 */
export function pickImageUrl(item) {
  if (!item || typeof item !== 'object') return '';
  return item.png || item.gif || item.url || '';
}

/** 外部图源多为 http，在安全上下文下会被浏览器拦截，统一升级为 https。 */
export function upgradeImageUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (value.startsWith('http://')) return `https://${value.slice('http://'.length)}`;
  return value;
}
