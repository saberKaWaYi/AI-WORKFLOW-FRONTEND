function getThemeScopeElement(scope) {
  return document.querySelector(`[data-theme-scope="${scope}"]`);
}

function resetThemeScope(scopeEl) {
  if (!scopeEl) return;
  scopeEl.classList.remove('dark');
  updateThemeButton(scopeEl);
}

export function resetThemeByName(scope) {
  resetThemeScope(getThemeScopeElement(scope));
}

function initThemeScope(scopeEl) {
  resetThemeScope(scopeEl);
}

export function initAllThemes() {
  document.querySelectorAll('[data-theme-scope]').forEach(initThemeScope);
}

function toggleThemeScope(scopeEl) {
  if (!scopeEl?.dataset.themeScope) return;
  scopeEl.classList.toggle('dark', !scopeEl.classList.contains('dark'));
  updateThemeButton(scopeEl);
}

function updateThemeButton(scopeEl) {
  if (!scopeEl) return;
  const icon = scopeEl.classList.contains('dark') ? '☾' : '☀';
  scopeEl.querySelectorAll('[data-theme-icon]').forEach((item) => {
    item.textContent = icon;
  });
}

export function bindThemeToggles() {
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    if (btn.dataset.themeBound) return;
    btn.dataset.themeBound = '1';
    btn.addEventListener('click', () => {
      const scopeEl = btn.closest('[data-theme-scope]');
      if (scopeEl) toggleThemeScope(scopeEl);
    });
  });
}
