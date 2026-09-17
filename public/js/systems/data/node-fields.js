/**
 * 节点字段取值工具。
 *
 * 数据约定：mongo / nebula 中的多语言字段均以 `{ 字段名_zh, 字段名_en }` 形式存储。
 *
 * 本模块只做一件事：按「字段名 + 语言」精确取值，取不到就返回空。
 * 不做语言降级、不做形态兼容、不猜备用字段——字段是否该存在由 contract.js 判定并报错，
 * 取值函数不替数据兜底。
 */
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
  return node?.properties?.[`name_${lang}`] || '';
}

export function getOtherName(node, lang) {
  return node?.properties?.[`name_${otherLanguage(lang)}`] || '';
}

export function compareNodes(a, b, lang) {
  const locale = lang === LANGUAGES.ZH ? 'zh-Hans-CN' : 'en';
  return getName(a, lang).localeCompare(getName(b, lang), locale);
}

// ---------- 关系（边）文案 ----------

/** 取指定语言的关系文案。 */
export function pickEdgeText(edge, lang) {
  return edge?.properties?.[`content_${lang}`] || '';
}

export function getRelationText(edge, lang) {
  return pickEdgeText(edge, lang);
}

export function edgeEndpoint(edge, side, lang) {
  return edge?.properties?.[`${side}_name_${lang}`] || '';
}

// ---------- 本地化字段块 ----------

/**
 * 块内键名前缀。默认与字段名同名（`{ storys_zh }`），
 * 少数业务字段名与键名不一致（genshin: `storys` -> `{ story_zh }`），
 * 由 profile 的 blockKey 显式声明，这里不做任何推断。
 */
function blockKeyOf(field, blockKey) {
  return blockKey || field;
}

/** 取字符串型本地化字段，如 `{ summary_zh, summary_en }`。 */
export function pickLocalized(data, field, lang, blockKey) {
  const block = data?.[field];
  if (!block || typeof block !== 'object') return '';
  return block[`${blockKeyOf(field, blockKey)}_${lang}`] || '';
}

/** 取对象型本地化字段，如 characteristics -> `{ abilities, appearance, ... }`。 */
export function pickLocalizedObject(data, field, lang, blockKey) {
  const block = data?.[field];
  if (!block || typeof block !== 'object') return null;
  const value = block[`${blockKeyOf(field, blockKey)}_${lang}`];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/** 取数组型本地化字段，如 incidents -> `[{ title, content }]`。 */
export function pickLocalizedList(data, field, lang, blockKey) {
  const block = data?.[field];
  if (!block || typeof block !== 'object') return [];
  const value = block[`${blockKeyOf(field, blockKey)}_${lang}`];
  return Array.isArray(value) ? value : [];
}

/** 取本地化字段的原始值（不限定类型）。 */
export function pickLocalizedRaw(data, field, lang, blockKey) {
  const block = data?.[field];
  if (!block || typeof block !== 'object') return null;
  return block[`${blockKeyOf(field, blockKey)}_${lang}`] ?? null;
}

/**
 * 判断字段值是否为本地化块：块内存在任意 `*_zh` / `*_en` 键即成立。
 * 用宽松判定而非"键名必须等于字段名"，是为了抓到字段名与键名不一致的漏配
 * （如 `storys` -> `{ story_zh }`），这类字段精确匹配会失败，从而被静默跳过。
 */
export function isLocalizedBlock(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => key.endsWith('_zh') || key.endsWith('_en'));
}

// ---------- 图片 ----------

/**
 * 从图片条目里取地址，字段名由调用方（profile 声明）指定，默认 `url`。
 * 不接受"哪个字段有值就用哪个"——图片字段名属于业务特化，必须写清楚。
 */
export function pickImageUrl(item, field = 'url') {
  if (!item || typeof item !== 'object') return '';
  return item[field] || '';
}

/** 外部图源多为 http，在安全上下文下会被浏览器拦截，统一升级为 https。 */
export function upgradeImageUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (value.startsWith('http://')) return `https://${value.slice('http://'.length)}`;
  return value;
}
