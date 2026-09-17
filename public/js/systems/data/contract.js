/**
 * 数据契约校验。
 *
 * 三条规则，没有第四条：
 *
 *  1. nebula 数据通用：所有业务的节点 / 边字段完全一致，缺一个字段就是违约，报错。
 *  2. mongo 数据特化：字段契约由 business-profile 声明。文档里有什么字段、哪个该显示、
 *     哪个刻意不显示，全部写在 profile 里——不允许前端"扫到什么算什么"。
 *  3. 字段为空（'' / []）是正常值，跳过渲染；字段缺失是违约，必须报错。
 *
 * 违约不会让页面白屏，而是渲染成顶部红色错误面板 + console.error，
 * 目的是让问题无法被忽略，而不是把页面搞崩。
 */
import { escapeHtml } from '../../core/utils.js';

/** 违约归属：nebula 通用数据 / mongo 特化数据 / profile 配置。 */
export const SCOPE = {
  NEBULA: 'nebula',
  MONGO: 'mongo',
  PROFILE: 'profile'
};

const SCOPE_LABEL = {
  [SCOPE.NEBULA]: 'nebula',
  [SCOPE.MONGO]: 'mongo',
  [SCOPE.PROFILE]: 'profile'
};

/** 单次校验最多收集的违约条数，避免脏数据把内存打满。 */
const MAX_VIOLATIONS = 200;

export class ContractError extends Error {
  constructor(violations, context = '') {
    super(`数据契约校验失败${context ? `（${context}）` : ''}：共 ${violations.length} 处违约`);
    this.name = 'ContractError';
    this.violations = violations;
    this.context = context;
  }
}

/**
 * 创建一个违约收集器。
 * 用法：checker.require(value, scope, subject, field) → 缺失时记录一条并返回 false。
 */
export function createChecker(context = '') {
  const violations = [];

  const add = (scope, subject, field, hint) => {
    if (violations.length >= MAX_VIOLATIONS) return;
    violations.push({ context, scope, subject, field, hint });
  };

  return {
    get length() {
      return violations.length;
    },
    get violations() {
      return violations;
    },

    /** 值缺失（undefined / null / ''）时记录一条违约。 */
    require(value, scope, subject, field, hint = '字段缺失') {
      if (value === undefined || value === null || value === '') {
        add(scope, subject, field, hint);
        return false;
      }
      return true;
    },

    /** 条件不成立时记录一条违约。 */
    expect(condition, scope, subject, field, hint) {
      if (!condition) {
        add(scope, subject, field, hint);
        return false;
      }
      return true;
    },

    /** 有违约就抛出 ContractError。用于无法继续渲染的致命场景。 */
    throwIfAny() {
      if (violations.length) throw new ContractError(violations.slice(), context);
    }
  };
}

/** 把一条违约翻译成人话。 */
export function describeViolation(violation) {
  const scope = SCOPE_LABEL[violation.scope] || violation.scope;
  const subject = violation.subject ? `[${violation.subject}]` : '';
  const field = violation.field ? ` ${violation.field}` : '';
  return `${scope}${subject}${field} — ${violation.hint}`;
}

/** 控制台输出全部违约，便于定位到具体条目。 */
export function logViolations(violations, context = '') {
  if (!violations?.length) return;
  console.error(`[数据契约] ${context || '校验'}失败，共 ${violations.length} 处：`);
  violations.forEach((violation) => console.error(`  · ${describeViolation(violation)}`));
}

/**
 * 把违约渲染成页面顶部红色错误面板。
 * 正文照常渲染，错误只做提示——问题要暴露，但页面不能废掉。
 */
export function renderContractErrors(violations, context = '', maxVisible = 30) {
  if (!violations?.length) return '';
  const visible = violations.slice(0, maxVisible);
  const rest = violations.length - visible.length;
  return `
    <div class="contract-errors" role="alert">
      <div class="contract-errors-head">
        <strong>数据契约校验失败${context ? `：${escapeHtml(context)}` : ''}</strong>
        <span>共 ${violations.length} 处违约。页面已按现有数据渲染，下列字段需修复数据或补全 profile 声明。</span>
      </div>
      <ol class="contract-errors-list">
        ${visible.map((violation) => `<li>${escapeHtml(describeViolation(violation))}</li>`).join('')}
      </ol>
      ${rest > 0 ? `<p class="contract-errors-more">另有 ${rest} 处未列出，详见控制台。</p>` : ''}
    </div>
  `;
}
