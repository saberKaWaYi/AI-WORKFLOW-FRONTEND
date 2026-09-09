import { api } from '../../core/api.js';
import { SYSTEM_IDS } from '../../core/constants.js';
import { ALL_SYSTEMS, ASSIGNABLE_SYSTEMS, ROLE_LABELS, ROLES, SYSTEM_LABELS, isAdminUser } from '../../auth/portal.js';

const SEARCH_FIELDS = [
  ['', '全部'],
  ['username', '账号'],
  ['email', '邮箱'],
  ['displayName', '名称'],
  ['role', '角色'],
  ['systems', '系统权限']
];

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN');
}

function canEditUser(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false;
  if (currentUser.username === targetUser.username) return false;
  if (targetUser.role === ROLES.ULTIMATE) return false;
  if (currentUser.role === ROLES.ULTIMATE) return true;
  if (currentUser.role === ROLES.SUPER) return targetUser.role === ROLES.USER;
  return false;
}

function canDeleteUser(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false;
  if (currentUser.username === targetUser.username) return false;
  if (targetUser.role === ROLES.ULTIMATE) return false;
  if (currentUser.role === ROLES.ULTIMATE) return true;
  if (currentUser.role === ROLES.SUPER) return targetUser.role === ROLES.USER;
  return false;
}

function renderRoleOptions(currentUser, user) {
  const options = [`<option value="${ROLES.USER}" ${user?.role === ROLES.USER ? 'selected' : ''}>普通用户</option>`];
  if (currentUser?.role === ROLES.ULTIMATE) {
    options.push(`<option value="${ROLES.SUPER}" ${user?.role === ROLES.SUPER ? 'selected' : ''}>超级用户</option>`);
  }
  return options.join('');
}

function renderSystemCheckboxes(user, locked) {
  return ASSIGNABLE_SYSTEMS.map((id) => {
    const checked = locked || user.allowedSystems?.includes(id);
    return `
      <label class="admin-chip">
        <input type="checkbox" data-system="${id}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''} />
        <span>${SYSTEM_LABELS[id]}</span>
      </label>
    `;
  }).join('');
}

function getSuperHelp(role) {
  return role === ROLES.SUPER ? '该角色默认拥有全部系统权限（含系统管理）' : '';
}

function renderRowActions(user, currentUser) {
  const editable = canEditUser(currentUser, user);
  const deletable = canDeleteUser(currentUser, user);
  if (!editable && !deletable) return '<span class="admin-muted">—</span>';

  const canEditRole = currentUser?.role === ROLES.ULTIMATE && user.role !== ROLES.ULTIMATE;
  /**
   * 系统权限对所有可编辑用户都展示；
   * 只有普通用户的权限可以勾选修改，超级及以上默认拥有全部，只读呈现。
   */
  const permissionsLocked = user.role !== ROLES.USER;

  return `
    <div class="admin-row-actions">
      ${editable ? `
        <details class="admin-edit">
          <summary>
            <span class="admin-edit-label">编辑</span>
            <span class="admin-edit-hint">角色 / 权限 / 状态</span>
          </summary>
          <div class="admin-edit-body">
            ${canEditRole ? `
              <section class="admin-edit-section">
                <h3 class="admin-edit-section-title">用户角色</h3>
                <label class="admin-field">
                  <select data-edit-role class="admin-field-input">
                    ${renderRoleOptions(currentUser, user)}
                  </select>
                </label>
              </section>
            ` : ''}

            <section class="admin-edit-section">
              <h3 class="admin-edit-section-title">系统权限</h3>
              <div class="admin-field">
                <span class="admin-helptext" data-super-help>${getSuperHelp(user.role)}</span>
                <div class="admin-systems admin-systems-inline${permissionsLocked ? ' is-locked' : ''}" data-permissions-user>
                  ${renderSystemCheckboxes(user, permissionsLocked)}
                </div>
              </div>
            </section>

            <section class="admin-edit-section">
              <h3 class="admin-edit-section-title">账号状态</h3>
              <label class="admin-field">
                <select data-active class="admin-field-input">
                  <option value="1" ${user.isActive ? 'selected' : ''}>启用</option>
                  <option value="0" ${!user.isActive ? 'selected' : ''}>禁用</option>
                </select>
              </label>
            </section>

            <div class="admin-action-row">
              <button type="button" class="ghost-btn admin-action-btn" data-save-user>保存修改</button>
            </div>
            <p class="form-message" data-row-message></p>
          </div>
        </details>
      ` : ''}

      ${deletable ? `
        <details class="admin-edit">
          <summary>
            <span class="admin-edit-label">删除</span>
            <span class="admin-edit-hint">软删除，不可恢复</span>
          </summary>
          <div class="admin-edit-body">
            <section class="admin-edit-section">
              <h3 class="admin-edit-section-title">删除账号</h3>
              <div class="admin-action-row">
                <button type="button" class="ghost-btn admin-action-btn admin-danger-btn" data-delete-user>确认删除</button>
              </div>
            </section>
            <p class="form-message" data-delete-message></p>
          </div>
        </details>
      ` : ''}
    </div>
  `;
}

function renderAccessDenied(container) {
  container.innerHTML = `
    <div class="admin-empty">
      <h2>无权限访问</h2>
      <p>仅终极用户与超级用户可进入系统管理。</p>
    </div>
  `;
}

function syncCreateFormSystems(form) {
  if (!form) return;
  const role = form.querySelector('[name="createRole"]')?.value;
  const fieldset = form.querySelector('[data-create-systems]');
  const checkboxes = form.querySelectorAll('[name="allowedSystems"]');
  const isSuper = role === ROLES.SUPER;

  checkboxes.forEach((input) => {
    input.disabled = isSuper;
    input.checked = isSuper || input.value === SYSTEM_IDS.DATA;
  });

  fieldset?.classList.toggle('is-locked', isSuper);
}

function resetCreateUserForm(form) {
  if (!form) return;
  form.reset();
  const roleSelect = form.querySelector('[name="createRole"]');
  if (roleSelect) roleSelect.value = ROLES.USER;
  const message = form.querySelector('[data-create-message]');
  if (message) message.textContent = '';
  syncCreateFormSystems(form);
}

function bindCreateForm(form) {
  if (!form || form.dataset.systemsBound) return;
  form.dataset.systemsBound = '1';
  form.querySelector('[name="createRole"]')?.addEventListener('change', () => syncCreateFormSystems(form));
  resetCreateUserForm(form);
}

async function fetchUsers() {
  const { users } = await api('/api/admin/users');
  return users || [];
}

function getFieldText(user, field) {
  const systemsText = (user.allowedSystems || []).map((id) => SYSTEM_LABELS[id] || id).join(' ');
  const roleText = ROLE_LABELS[user.role] || user.role;

  switch (field) {
    case 'username':
      return user.username || '';
    case 'email':
      return user.email || '';
    case 'displayName':
      return user.displayName || '';
    case 'role':
      return roleText;
    case 'systems':
      return systemsText;
    default:
      return [user.username, user.email, user.displayName, roleText, systemsText].filter(Boolean).join(' ');
  }
}

function renderUsersTable(container, currentUser, users, field, query) {
  const tableWrap = container.querySelector('[data-users-table]');
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const normalizedField = String(field || '').trim();

  const filteredUsers = normalizedQuery
    ? users.filter((user) => getFieldText(user, normalizedField).toLowerCase().includes(normalizedQuery))
    : users;

  if (!filteredUsers.length) {
    tableWrap.innerHTML = `
      <div class="admin-empty admin-empty-inline">
        <h2>没有匹配的用户</h2>
        <p>试试切换搜索类别，或者换一个关键词。</p>
      </div>
    `;
    return;
  }

  tableWrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>账号</th>
          <th>邮箱</th>
          <th>名称</th>
          <th>角色</th>
          <th>系统权限</th>
          <th>创建时间</th>
          <th>更新时间</th>
          <th>上次登录</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${filteredUsers.map((user) => renderUserRow(user, currentUser)).join('')}
      </tbody>
    </table>
  `;
}

function renderUserRow(user, currentUser) {
  const systems = (user.allowedSystems || []).map((id) => SYSTEM_LABELS[id] || id);
  const systemsMarkup = systems.length
    ? `<div class="admin-system-list">${systems.map((label) => `<span class="admin-system-pill">${label}</span>`).join('')}</div>`
    : '<span class="admin-system-empty">—</span>';

  return `
    <tr data-user-id="${user.id}" data-user-role="${user.role}">
      <td class="admin-cell-account">${user.username}</td>
      <td class="admin-cell-email">${user.email || '—'}</td>
      <td class="admin-cell-display">${user.displayName || '—'}</td>
      <td>${ROLE_LABELS[user.role] || user.role}</td>
      <td class="admin-cell-systems">${systemsMarkup}</td>
      <td class="admin-cell-date">${formatDate(user.createdAt)}</td>
      <td class="admin-cell-date">${formatDate(user.updatedAt)}</td>
      <td class="admin-cell-date">${formatDate(user.lastLoginAt)}</td>
      <td>${user.isActive ? '启用' : '禁用'}</td>
      <td class="admin-cell-actions">
        ${renderRowActions(user, currentUser)}
      </td>
    </tr>
  `;
}

async function refreshAfterMutation(container, currentUser) {
  const users = await fetchUsers();
  const searchField = container.querySelector('[data-user-search-field]');
  const searchInput = container.querySelector('[data-user-search]');
  renderUsersTable(container, currentUser, users, searchField?.value || '', searchInput?.value || '');
  bindRowActions(container, currentUser);
}

function bindRowActions(container, currentUser) {
  container.querySelectorAll('[data-edit-role]').forEach((select) => {
    select.addEventListener('change', () => {
      const row = select.closest('[data-user-id]');
      const permissions = row?.querySelector('[data-permissions-user]');
      const superHelp = row?.querySelector('[data-super-help]');
      const isUser = select.value === ROLES.USER;

      if (superHelp) superHelp.textContent = getSuperHelp(select.value);
      permissions?.classList.toggle('is-locked', !isUser);
      permissions?.querySelectorAll('[data-system]').forEach((input) => {
        input.disabled = !isUser;
        input.checked = !isUser || input.dataset.system === SYSTEM_IDS.DATA;
      });
    });
  });

  container.querySelectorAll('[data-save-user]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('[data-user-id]');
      const userId = row?.dataset.userId;
      const message = row?.querySelector('[data-row-message]');
      if (!userId || !row) return;

      const roleSelect = row.querySelector('[data-edit-role]');
      const effectiveRole = roleSelect?.value || row.dataset.userRole;
      const allowedSystems = [...row.querySelectorAll('[data-system]:checked')].map((input) => input.dataset.system);
      const isActive = row.querySelector('[data-active]')?.value === '1';

      if (effectiveRole === ROLES.USER && !allowedSystems.length) {
        message.textContent = '请至少选择一个系统权限';
        return;
      }

      const payload = { isActive };
      if (effectiveRole === ROLES.USER) payload.allowedSystems = allowedSystems;
      if (currentUser?.role === ROLES.ULTIMATE && roleSelect) payload.role = effectiveRole;

      message.textContent = '';
      await api(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      message.textContent = '已保存';
      await refreshAfterMutation(container, currentUser);
    });
  });

  container.querySelectorAll('[data-delete-user]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('[data-user-id]');
      const userId = row?.dataset.userId;
      if (!userId || !row) return;
      await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
      await refreshAfterMutation(container, currentUser);
    });
  });
}

async function onCreateUser(event, currentUser) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = form.querySelector('[data-create-message]');
  const formData = new FormData(form);
  const role = formData.get('createRole');
  const allowedSystems = role === ROLES.SUPER ? ALL_SYSTEMS : formData.getAll('allowedSystems');

  if (role === ROLES.USER && !allowedSystems.length) {
    message.textContent = '请至少选择一个系统权限';
    return;
  }

  message.textContent = '';
  await api('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      username: formData.get('createUsername'),
      displayName: formData.get('createDisplayName'),
      email: formData.get('createEmail'),
      password: formData.get('createPassword'),
      role,
      allowedSystems
    })
  });
  resetCreateUserForm(form);
  message.textContent = '用户已创建';
  const root = form.closest('[data-admin-main]') || form.closest('.admin-page')?.parentElement;
  if (root) await refreshAfterMutation(root, currentUser);
}

export async function renderUsersPanel(container, currentUser) {
  if (!container) return;
  if (!isAdminUser(currentUser)) {
    renderAccessDenied(container);
    return;
  }

  container.innerHTML = `
    <div class="admin-page">
      <header class="admin-header">
        <div>
          <h1>用户管理</h1>
          <p>创建账号、分配系统访问权限，并管理账号状态。</p>
        </div>
      </header>
      <section class="admin-card">
        <h2>创建用户</h2>
        <form class="admin-form" data-create-user-form autocomplete="off">
          <div class="admin-form-grid">
            <label>账号<input name="createUsername" autocomplete="off" required /></label>
            <label>名称<input name="createDisplayName" autocomplete="off" /></label>
            <label>邮箱<input name="createEmail" type="email" autocomplete="off" /></label>
            <label>密码<input name="createPassword" type="password" autocomplete="new-password" required /></label>
            <label>角色
              <select name="createRole">
                ${renderRoleOptions(currentUser)}
              </select>
            </label>
          </div>
          <fieldset class="admin-systems" data-create-systems>
            <legend>系统权限</legend>
            ${ASSIGNABLE_SYSTEMS.map((id) => `
              <label class="admin-chip">
                <input type="checkbox" name="allowedSystems" value="${id}" ${id === SYSTEM_IDS.DATA ? 'checked' : ''} />
                <span>${SYSTEM_LABELS[id]}</span>
              </label>
            `).join('')}
          </fieldset>
          <button class="primary-btn" type="submit">创建用户</button>
          <p class="form-message" data-create-message></p>
        </form>
      </section>
      <section class="admin-card">
        <h2>用户列表</h2>
        <div class="admin-list-toolbar">
          <div class="admin-search-group">
            <label class="admin-search">
              <span>搜索类别</span>
              <select data-user-search-field>
                ${SEARCH_FIELDS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
              </select>
            </label>
            <label class="admin-search">
              <span>关键词</span>
              <input type="search" data-user-search placeholder="输入关键词" autocomplete="off" />
            </label>
          </div>
        </div>
        <div class="admin-table-wrap" data-users-table>加载中…</div>
      </section>
    </div>
  `;

  const createForm = container.querySelector('[data-create-user-form]');
  createForm?.addEventListener('submit', (event) => onCreateUser(event, currentUser));
  bindCreateForm(createForm);

  const users = await fetchUsers();
  const searchField = container.querySelector('[data-user-search-field]');
  const searchInput = container.querySelector('[data-user-search]');
  const render = () => renderUsersTable(container, currentUser, users, searchField?.value || '', searchInput?.value || '');

  searchField?.addEventListener('change', render);
  searchInput?.addEventListener('input', render);
  render();
  bindRowActions(container, currentUser);
}
