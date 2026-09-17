import { pickLocalized, isLocalizedBlock } from './node-fields.js';
import { ContractError, SCOPE, createChecker } from './contract.js';

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
    // 该业务的 mongo 只采集了中文：所有 `*_en` 均为空占位（"" / []），不是数据缺失。
    // 声明后契约校验在 en 语言下跳过取值检查（块结构仍校验），避免把占位当成违约。
    placeholderLanguages: ['en'],
    metaFields: GENSHIN_META_FIELDS,
    heroSubFields: ['title', 'identity', 'nick_name'],
    // 图片地址字段名是业务特化的一部分：立绘用 png、动图用 gif，写死在 profile 里
    heroImage: { source: 'pngs', imageField: 'png' },
    sections: [
      { field: 'introduction', title: '介绍', type: 'text' },
      // 字段名 storys，块内键名却是 story_{lang}（后端历史命名），用 blockKey 声明差异
      { field: 'storys', title: '故事', type: 'text-list', blockKey: 'story' },
      { field: 'skill_effect', title: '技能效果', type: 'kv-list' },
      { field: 'level_effect', title: '等级效果', type: 'kv-list' },
      { field: 'pngs', title: '图片', type: 'image-list', imageField: 'png' },
      { field: 'gifs', title: '动作', type: 'gif-list', imageField: 'gif' },
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
    // 不展示但必须声明：related_scps 是建边原料，后端由它生成 nebula 的 SCP_to_SCP 边。
    // 关联关系只从图里拿，正文不再渲染第二遍。
    hiddenFields: ['related_scps'],
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
    // metaFields 第三项是可选声明：`{ lang }` 读指定语言（pcr 的 name 块里有 name_ja / name_kana），
    // `{ blockKey }` 处理块内键名与字段名不一致。不填就是读当前语言的 `{字段_zh}`。
    metaFields: [
      ['name', '日文名', { lang: 'ja' }],
      ['name', '假名', { lang: 'kana' }],
      ['race', '种族'],
      ['guild', '公会'],
      ['element', '属性'],
      ['position', '定位'],
      ['attack_type', '攻击类型'],
      ['attributes', '综合标签'],
      ['base_character', '基准角色'],
      ['height', '身高'],
      ['weight', '体重'],
      ['age', '年龄'],
      ['birthday', '生日'],
      ['blood_type', '血型'],
      ['interest', '兴趣']
    ],
    heroSubFields: ['full_name'],
    // 头像在 avatars[{url}] 数组里（无 *_en，日文当中文）
    heroImage: { source: 'avatars', imageField: 'url' },
    sectionNav: true,
    // mongo 文档的每个字段都必须落到这里（显示或 hiddenFields 显式声明），一个都不能静默丢弃
    // 结构差异全部落在 map 里：渲染器只认 heading/body/badge 这类角色，不认业务字段名
    sections: [
      { field: 'introduction', title: '介绍', type: 'text' },
      { field: 'nicknames', title: '昵称', type: 'text-list' },
      // initial_star 是全库唯一的裸标量（数字），没有语言外层
      { field: 'initial_star', title: '初始星级', type: 'text', raw: true },
      // raw: true —— 该字段直接存数组 / 对象，不是 `{字段_zh}` 本地化块
      { field: 'equipment', title: '装备', type: 'kv-raw', raw: true, labels: { name_zh: '名称', description_zh: '描述' } },
      {
        field: 'skills',
        title: '技能',
        type: 'entry-list',
        raw: true,
        map: {
          heading: ['name_zh', 'name_extra'],
          badge: 'slot',
          image: 'icon',
          body: 'description',
          extra: ['upgraded_name_zh', 'upgraded_description'],
          extraLabel: '升级后',
          audio: 'voices',
          ordinal: true,
          variant: 'detail-entry-skill'
        }
      },
      {
        field: 'bonds',
        title: '羁绊',
        type: 'entry-list',
        raw: true,
        map: { icon: '♥', heading: 'level', headingPrefix: 'Lv.', body: 'effect', audio: 'voices', variant: 'detail-entry-bond' }
      },
      { field: 'other_voices', title: '语音', type: 'audio-list', raw: true, map: { heading: 'scene', urls: 'voices' } },
      {
        field: 'stories',
        title: '角色故事',
        type: 'dialogue-list',
        raw: true,
        map: {
          groups: 'chapters',
          heading: 'title',
          lines: 'lines',
          speaker: 'speaker',
          text: 'text',
          scroll: true,
          link: 'url',
          variant: 'detail-entry-chapter'
        }
      },
      {
        field: 'story_lines',
        title: '剧情台词',
        type: 'dialogue-list',
        raw: true,
        map: {
          heading: 'group',
          lines: 'lines',
          groupAudio: 'group_voices',
          lineIndex: true,
          icon: '❖',
          variant: 'detail-entry-group'
        }
      },
      { field: 'avatars', title: '头像', type: 'image-list', imageField: 'url' },
      { field: 'portrait', title: '肖像', type: 'image-list', imageField: 'url', captionField: 'tab' },
      { field: 'artwork', title: '立绘', type: 'image-list', imageField: 'url', captionField: 'tab' },
      // ub_animations 是 `{ub, ub_6star}` 对象而非数组，labels 给两个键配中文说明
      {
        field: 'ub_animations',
        title: 'UB 动画',
        type: 'image-map',
        raw: true,
        labels: { ub: 'UB', ub_6star: '6 星 UB' }
      },
      { field: 'url', title: '资料页', type: 'link', raw: true }
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
    // related_entries 必须写进 hiddenFields：它和 nebula 的「相关条目」是同一批关系，
    // 关联关系只从图里拿，正文不再渲染第二遍。
    hiddenFields: ['related_entries'],
    sections: [
      { field: 'summary', title: '概述', type: 'text' },
      { field: 'description', title: '描述', type: 'text' },
      { field: 'aliases', title: '别名', type: 'text-list' },
      { field: 'characteristics', title: '特征', type: 'kv-object', labels: CHARACTERISTIC_LABELS },
      { field: 'entrances', title: '入口', type: 'text' },
      { field: 'exits', title: '出口', type: 'text' },
      { field: 'hazards', title: '危险', type: 'text' },
      { field: 'usage', title: '用途', type: 'text' },
      { field: 'acquisition', title: '获取方式', type: 'text' },
      { field: 'habitat', title: '栖息地', type: 'text' },
      { field: 'bases_outposts_communities', title: '基地前哨与社群', type: 'text' },
      { field: 'additional_sections', title: '补充章节', type: 'titled-list' },
      {
        field: 'attributes',
        title: '属性',
        type: 'entry-list',
        map: { heading: 'name', body: 'value' }
      }
    ]
  }
};

export function getBusinessProfile(businessName) {
  return BUSINESS_PROFILES[businessName] || null;
}

/**
 * 取业务 profile。未注册的业务直接抛错——
 * 前端不做"扫到什么字段就渲染什么"的猜测，字段结构必须由 profile 声明。
 */
export function requireProfile(businessName) {
  const profile = BUSINESS_PROFILES[businessName];
  if (!profile) {
    const available = Object.keys(BUSINESS_PROFILES).join('、');
    throw new ContractError(
      [{
        context: String(businessName),
        scope: SCOPE.PROFILE,
        subject: String(businessName),
        field: '',
        hint: `未注册业务 profile，前端拒绝猜测字段结构（已注册：${available}）`
      }],
      String(businessName)
    );
  }
  return profile;
}

/** profile 声明过的全部字段名，用于发现"文档里有、profile 没声明"的漏配。 */
function declaredFields(profile) {
  const fields = new Set(['key', 'name']);
  (profile.metaFields || []).forEach(([field]) => fields.add(field));
  (profile.heroSubFields || []).forEach((field) => fields.add(field));
  (profile.hiddenFields || []).forEach((field) => fields.add(field));
  (profile.sections || []).forEach((section) => fields.add(section.field));
  if (profile.heroImage?.field) fields.add(profile.heroImage.field);
  return fields;
}

/** 读原始数组的区块类型：图片、动图、语音。 */
const RAW_ARRAY_TYPES = new Set(['image-list', 'gif-list', 'voice']);

/**
 * mongo 文档契约校验。
 * - profile 声明的字段（未标 optional）缺失 → 违约；
 * - 文档里出现 profile 未声明的 `{字段_zh}` 块 → 违约（漏配，数据会被静默丢弃）；
 * - 字段存在但值为空 → 正常，视为"该条目没有这项内容"；
 * - 业务声明了 placeholderLanguages 的语言 → 跳过"有没有值"，只校验块结构。
 */
export function checkMongoContract(profile, data, lang) {
  const checker = createChecker(profile.label || 'mongo');
  if (!data || typeof data !== 'object') {
    checker.expect(false, SCOPE.MONGO, '(整个文档)', '', '详情接口未返回文档对象');
    return checker.violations;
  }

  const subject = data.key || '(缺少 key)';
  checker.require(data.key, SCOPE.MONGO, subject, 'key', 'mongo 文档缺少 key');

  // 该业务声明当前语言为占位：mongo 里本就没有该语言的真实内容（如 genshin 的 *_en）。
  // 只校验块结构，不校验"有没有值"——占位不是缺失，报错就是误报。
  const isPlaceholder = (profile.placeholderLanguages || []).includes(lang);

  const nameBlock = data.name;
  checker.expect(
    nameBlock && typeof nameBlock === 'object' && !Array.isArray(nameBlock),
    SCOPE.MONGO, subject, 'name', '缺少 name 本地化块'
  );
  if (!isPlaceholder) {
    checker.expect(
      nameBlock?.[`name_${lang}`] !== undefined,
      SCOPE.MONGO, subject, `name_${lang}`, '缺少当前语言的名称'
    );
  }

  const expectBlock = (field, where, blockKey, blockLang) => {
    const key = blockKey || field;
    // 声明指定了语言时按该语言校验（如 pcr 的日文名），否则按当前语言
    const checkLang = blockLang || lang;
    const block = data[field];
    checker.expect(
      block !== undefined,
      SCOPE.MONGO, subject, field, `${where}声明了该字段，文档中不存在`
    );
    if (block === undefined) return;
    checker.expect(
      block && typeof block === 'object' && !Array.isArray(block),
      SCOPE.MONGO, subject, field, '应为 {字段_zh} 本地化块'
    );
    if (isPlaceholder) return;
    checker.expect(
      block?.[`${key}_${checkLang}`] !== undefined,
      SCOPE.MONGO, subject, `${key}_${checkLang}`, `缺少 ${checkLang} 的值`
    );
  };

  (profile.metaFields || []).forEach(([field, , options]) => {
    expectBlock(field, 'metaFields', options?.blockKey, options?.lang);
  });
  (profile.heroSubFields || []).forEach((field) => expectBlock(field, 'heroSubFields'));
  (profile.sections || []).forEach((section) => {
    if (section.optional) return;
    if (RAW_ARRAY_TYPES.has(section.type)) {
      checker.expect(
        Array.isArray(data[section.field]),
        SCOPE.MONGO, subject, section.field, `type 为 ${section.type}，文档里应为数组`
      );
      return;
    }
    if (section.raw) {
      checker.expect(
        data[section.field] !== undefined,
        SCOPE.MONGO, subject, section.field, 'sections 声明了该字段（原始值），文档中不存在'
      );
      return;
    }
    expectBlock(section.field, 'sections', section.blockKey);
  });
  if (profile.heroImage?.source === 'localized') {
    expectBlock(profile.heroImage.field, 'heroImage');
  }

  const declared = declaredFields(profile);
  Object.entries(data).forEach(([field, value]) => {
    if (declared.has(field)) return;
    if (!isLocalizedBlock(value)) return;
    checker.expect(
      false,
      SCOPE.PROFILE, subject, field,
      '文档存在该字段但 profile 未声明：补进 sections 显示，或写进 hiddenFields 显式声明不显示'
    );
  });

  return checker.violations;
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
