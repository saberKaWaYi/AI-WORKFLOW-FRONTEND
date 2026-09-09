import { pickLocalized } from './node-fields.js';

const GENSHIN_META_FIELDS = [
  ['identity', '身份'],
  ['title', '称号'],
  ['element', '元素'],
  ['weapon', '武器'],
  ['personal_faction', '所属'],
  ['national_faction', '国家'],
  ['gender', '性别'],
  ['race', '种族'],
  ['born_date', '生日'],
  ['born_area', '出生地'],
  ['body_type', '体型'],
  ['constellation', '命座'],
  ['role_position', '定位'],
  ['bond_prop', '羁绊']
];

const SCP_CHARACTERISTIC_LABELS = {
  abilities: '能力',
  appearance: '外观',
  behavior: '行为',
  properties: '性质'
};

const SCP_META_FIELDS = [
  ['object_class', '项目分级']
];

export const BUSINESS_PROFILES = {
  genshin: {
    label: '原神角色',
    relatedTitle: '相关角色',
    noRelated: '暂无相关角色',
    metaFields: GENSHIN_META_FIELDS,
    heroSubFields: ['title', 'identity', 'nick_name'],
    heroImage: { source: 'pngs' },
    sections: [
      { field: 'introduction', title: '介绍', type: 'text' },
      { field: 'storys', title: '故事', type: 'story-list' },
      { field: 'skill_effect', title: '技能效果', type: 'kv-list' },
      { field: 'level_effect', title: '等级效果', type: 'kv-list' },
      { field: 'pngs', title: '图片', type: 'image-list' },
      { field: 'gifs', title: '动作', type: 'gif-list' },
      { field: 'voice', title: '语音', type: 'voice' }
    ]
  },
  scp: {
    label: 'SCP 项目',
    relatedTitle: '相关项目',
    noRelated: '暂无相关项目',
    metaFields: SCP_META_FIELDS,
    heroSubFields: [],
    heroImage: { source: 'localized', field: 'image' },
    sections: [
      { field: 'summary', title: '概述', type: 'text' },
      { field: 'special_containment_procedures', title: '特殊收容措施', type: 'text' },
      { field: 'description', title: '描述', type: 'text' },
      { field: 'characteristics', title: '特征', type: 'kv-object', labels: SCP_CHARACTERISTIC_LABELS },
      { field: 'incidents', title: '事故记录', type: 'titled-list' },
      { field: 'experiment_logs', title: '实验记录', type: 'titled-list' },
      { field: 'additional_sections', title: '补充章节', type: 'titled-list' },
      { field: 'related_scps', title: '正文关联项目', type: 'scp-links' }
    ]
  }
};

const FALLBACK_PROFILE = {
  label: '',
  relatedTitle: '相关条目',
  noRelated: '暂无相关条目',
  metaFields: [],
  heroSubFields: [],
  heroImage: null,
  sections: []
};

const FALLBACK_TEXT_FIELDS = [
  ['summary', '概述'],
  ['introduction', '介绍'],
  ['description', '描述']
];

export function getBusinessProfile(businessName) {
  return BUSINESS_PROFILES[businessName] || null;
}

export function resolveProfile(businessName, data) {
  const known = getBusinessProfile(businessName);
  if (known) return known;
  return buildFallbackProfile(data);
}

function buildFallbackProfile(data) {
  if (!data || typeof data !== 'object') return { ...FALLBACK_PROFILE };

  const fields = Object.keys(data).filter((key) => isLocalizedBlock(data[key], key));
  const textFields = FALLBACK_TEXT_FIELDS.filter(([field]) => fields.includes(field));
  const restFields = fields
    .filter((field) => !textFields.some(([known]) => known === field))
    .filter((field) => !['name'].includes(field));

  return {
    ...FALLBACK_PROFILE,
    sections: [
      ...textFields.map(([field, title]) => ({ field, title, type: 'text' })),
      ...restFields.map((field) => ({ field, title: field, type: 'auto' }))
    ]
  };
}

function isLocalizedBlock(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return `${field}_zh` in value || `${field}_en` in value;
}

export function getHeroTexts(profile, data, lang) {
  return (profile.heroSubFields || [])
    .map((field) => pickLocalized(data, field, lang))
    .filter(Boolean);
}
