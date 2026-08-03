import { DATA_TEXT } from '../../core/state.js';

export function getName(node, lang) {
  const props = node?.properties || {};
  return props[`name_${lang}`] || props.name_en || node?.vid || DATA_TEXT.unknown;
}

export function getOtherName(node, lang) {
  const next = lang === 'zh' ? 'en' : 'zh';
  return node?.properties?.[`name_${next}`] || node?.vid || '';
}

export function compareNodes(a, b, lang) {
  const locale = lang === 'zh' ? 'zh-Hans-CN' : 'en';
  return getName(a, lang).localeCompare(getName(b, lang), locale);
}

export function edgeEndpoint(edge, side, lang) {
  return edge?.properties?.[`${side}_name_${lang}`] || edge?.[`${side}_id`] || '';
}

export function getRelationText(edge, lang) {
  const props = edge?.properties || {};
  return props[`content_${lang}`] || props[`title_${lang}`] || '';
}

export function pickLocalized(data, field, lang) {
  const block = data?.[field];
  if (!block || typeof block !== 'object') return '';
  return block[`${field}_${lang}`] || block[`${field}_en`] || block[`${field}_zh`] || '';
}

export function pickLocalizedList(data, field, lang) {
  const block = data?.[field];
  if (!block || typeof block !== 'object') return [];
  const candidates = [
    block[`${field}_${lang}`],
    block[`${field}_zh`],
    block[`${field}_en`]
  ];
  const list = candidates.find((item) => Array.isArray(item) && item.length);
  if (list) return list;
  const fallback = candidates.find((item) => Array.isArray(item));
  return fallback || [];
}
