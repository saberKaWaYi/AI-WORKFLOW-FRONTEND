import { api } from '../../core/api.js';

/**
 * 当前登录用户的「我的配置」编辑器：仅管理自己的 model_providers。
 * 数据契约 list[dict]：{ provider, domain, apiKey }。
 * 严格只在本编辑器读写——不进列表、不进 /me、不进登录态。
 * 由系统管理面板（renderUsersPanel）在「我的配置」卡片内调用。
 */

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderProviderRow(item = {}) {
  const p = escapeAttr(item.provider);
  const d = escapeAttr(item.domain);
  const k = escapeAttr(item.apiKey);
  return `
    <div class="admin-provider-row" data-provider-row>
      <input type="text" class="admin-field-input" data-provider-name placeholder="文本模型供应商" value="${p}" />
      <input type="text" class="admin-field-input" data-provider-domain placeholder="域名 / URL" value="${d}" />
      <input type="password" class="admin-field-input" data-provider-key placeholder="API Key" value="${k}" autocomplete="new-password" />
      <button type="button" class="ghost-btn admin-action-btn admin-danger-btn" data-remove-provider>删除</button>
    </div>`;
}

function renderModelProvidersEditor(initial = []) {
  const list = Array.isArray(initial) && initial.length ? initial : [{}];
  return `
    <section class="admin-edit-section">
      <h3 class="admin-edit-section-title">模型供应商配置</h3>
      <span class="admin-helptext">文本模型供应商 / 域名 / API Key，可增删多组；provider + domain 齐全才会保存。</span>
      <div class="admin-providers" data-providers>${list.map((item) => renderProviderRow(item)).join('')}</div>
      <button type="button" class="ghost-btn admin-action-btn" data-add-provider>添加一组</button>
    </section>`;
}

function collectModelProviders(scope) {
  const out = [];
  scope.querySelectorAll('[data-provider-row]').forEach((row) => {
    const provider = row.querySelector('[data-provider-name]')?.value.trim();
    const domain = row.querySelector('[data-provider-domain]')?.value.trim();
    const apiKey = row.querySelector('[data-provider-key]')?.value.trim();
    if (provider && domain) out.push({ provider, domain, apiKey });
  });
  return out;
}

function bindProviderEditor(scope) {
  const box = scope.querySelector('[data-providers]');
  scope.addEventListener('click', (event) => {
    if (event.target.matches('[data-add-provider]')) {
      box?.insertAdjacentHTML('beforeend', renderProviderRow({}));
    } else if (event.target.matches('[data-remove-provider]')) {
      event.target.closest('[data-provider-row]')?.remove();
    }
  });
}

/**
 * 把「我的配置」编辑器渲染进给定容器（系统管理面板内的卡片）。
 * 针对当前登录用户自己，走 /api/auth/providers。
 */
export async function renderMyProvidersEditor(container) {
  if (!container) return;

  let initial = [];
  try {
    const data = await api('/api/auth/providers');
    initial = data.modelProviders || [];
  } catch {
    initial = [];
  }

  container.innerHTML = `
    <h2>我的配置</h2>
    <p class="admin-card-desc">配置你自己的文本模型供应商（供应商 / 域名 / API Key）。仅你自己可见，不会出现在登录态或其他页面。</p>
    <form class="admin-form" data-account-providers-form autocomplete="off">
      ${renderModelProvidersEditor(initial)}
      <button class="primary-btn" type="submit">保存配置</button>
      <p class="form-message" data-account-message></p>
    </form>
  `;

  const form = container.querySelector('[data-account-providers-form]');
  bindProviderEditor(form);
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = form.querySelector('[data-account-message]');
    if (!message) return;
    message.textContent = '';
    try {
      await api('/api/auth/providers', {
        method: 'PATCH',
        body: JSON.stringify({ modelProviders: collectModelProviders(form) })
      });
      message.textContent = '已保存';
    } catch (err) {
      message.textContent = err?.message || '保存失败';
    }
  });
}
