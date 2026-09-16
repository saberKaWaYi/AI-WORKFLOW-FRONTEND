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

// 特征子字段 -> 中文标签。scp 与后室的特征字段同名，共用一份
const CHARACTERISTIC_LABELS = {
  abilities: '能力',
  appearance: '外观',
  behavior: '行为',
  properties: '性质'
};

const SCP_META_FIELDS = [
  ['object_class', '项目分级']
];

/** 剧情文档（独立 mongo 表）的字段契约：键为渲染角色，值为该业务的字段名。 */
export const DEFAULT_STORY_FIELDS = {
  title: 'title',
  chapter: 'chapter',
  episode: 'episode_no',
  summary: 'summary',
  category: 'category',
  characters: 'characters',
  lines: 'lines'
};

const PCR_STORY_FIELDS = { ...DEFAULT_STORY_FIELDS };

const PCR_STORY_CATEGORY_LABELS = { 主线: '主线剧情', 活动: '活动剧情' };

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
      { field: 'characteristics', title: '特征', type: 'kv-object', labels: CHARACTERISTIC_LABELS },
      { field: 'incidents', title: '事故记录', type: 'titled-list' },
      { field: 'experiment_logs', title: '实验记录', type: 'titled-list' },
      { field: 'additional_sections', title: '补充章节', type: 'titled-list' }
    ]
  },
  pcr: {
    label: 'PCR 角色',
    relatedTitle: '相关角色',
    noRelated: '暂无相关角色',
    // 字段均为 {字段_zh} 扁平本地化块，pickLocalized 可直接消费
    metaFields: [
      ['race', '种族'],
      ['guild', '公会'],
      ['element', '属性'],
      ['position', '定位'],
      ['attack_type', '攻击类型'],
      ['base_character', '基准角色']
    ],
    heroSubFields: ['full_name'],
    // 头像在 avatars[{url}] 数组里（无 *_en，日文当中文）
    heroImage: { source: 'avatars' },
    sectionNav: true,
    // 结构差异全部落在 map 里：渲染器只认 heading/body/badge 这类角色，不认业务字段名
    sections: [
      { field: 'introduction', title: '介绍', type: 'text' },
      { field: 'equipment', title: '装备', type: 'auto' },
      {
        field: 'skills',
        title: '技能',
        type: 'entry-list',
        map: {
          heading: ['name_zh', 'name_extra'],
          badge: 'slot',
          body: 'description',
          extra: ['upgraded_name_zh', 'upgraded_description'],
          extraLabel: '升级后',
          ordinal: true,
          variant: 'detail-entry-skill'
        }
      },
      {
        field: 'bonds',
        title: '羁绊',
        type: 'entry-list',
        map: { icon: '♥', heading: 'level', headingPrefix: 'Lv.', body: 'effect', variant: 'detail-entry-bond' }
      },
      { field: 'other_voices', title: '语音', type: 'audio-list', map: { heading: 'scene', urls: 'voices' } },
      {
        field: 'stories',
        title: '角色故事',
        type: 'dialogue-list',
        map: { heading: 'title', lines: 'lines', scroll: true, link: 'url', variant: 'detail-entry-chapter' }
      },
      {
        field: 'story_lines',
        title: '剧情台词',
        type: 'dialogue-list',
        map: { heading: 'group', lines: 'lines', lineIndex: true, icon: '❖', variant: 'detail-entry-group' }
      }
    ],
    // 额外挂了一张独立的剧情 mongo 表，属数据层差异，用开关声明而非在视图里写死业务名
    storyModule: true,
    storyTitle: '相关剧情',
    storyFields: PCR_STORY_FIELDS,
    storyCategoryLabels: PCR_STORY_CATEGORY_LABELS
  },
  backrooms: {
    label: '后室条目',
    relatedTitle: '相关条目',
    noRelated: '暂无相关条目',
    metaFields: [
      ['category', '类别'],
      ['classification', '安全等级']
    ],
    heroSubFields: ['entry_id'],
    // 后室是纯文本资料站，无图源；详情页不显示头图
    heroImage: null,
    sectionNav: true,
    // 全部走通用 type，无需专用渲染器。
    // 刻意不配 related_entries：关联从 Nebula 图实时算（与 scp 一致），
    // 配了就会和「相关条目」区块重复渲染同一批数据。
    sections: [
      { field: 'summary', title: '概述', type: 'text' },
      { field: 'description', title: '描述', type: 'text' },
      { field: 'characteristics', title: '特征', type: 'kv-object', labels: CHARACTERISTIC_LABELS },
      { field: 'entrances', title: '入口', type: 'text' },
      { field: 'exits', title: '出口', type: 'text' },
      { field: 'hazards', title: '危险', type: 'text' },
      { field: 'usage', title: '用途', type: 'text' },
      { field: 'acquisition', title: '获取方式', type: 'text' },
      { field: 'habitat', title: '栖息地', type: 'text' },
      { field: 'bases_outposts_communities', title: '基地前哨与社群', type: 'text' },
      { field: 'additional_sections', title: '补充章节', type: 'titled-list' },
      { field: 'attributes', title: '属性', type: 'auto' }
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
  storyModule: false,
  storyFields: DEFAULT_STORY_FIELDS,
  storyCategoryLabels: {},
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

/**
 * 剧情模块配置。业务未声明 storyModule 时返回 null，
 * 视图据此决定是否渲染剧情入口，避免在通用文件里写死业务名。
 */
export function getStoryConfig(businessName) {
  const profile = getBusinessProfile(businessName);
  if (!profile?.storyModule) return null;
  return {
    title: profile.storyTitle || '相关剧情',
    fields: { ...DEFAULT_STORY_FIELDS, ...(profile.storyFields || {}) },
    categoryLabels: profile.storyCategoryLabels || {}
  };
}

export function getHeroTexts(profile, data, lang) {
  return (profile.heroSubFields || [])
    .map((field) => pickLocalized(data, field, lang))
    .filter(Boolean);
}
