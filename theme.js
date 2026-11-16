/* Appearance only: never read or write study records. */
(() => {
  'use strict';
  const KEY = 'study-pocket-appearance-v1';
  let button;
  const clean = value => value === 'simple' ? 'simple' : 'voxel';
  const apply = value => {
    const theme = clean(value);
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'voxel' ? '#dce9cf' : '#f7f5ef');
    if (button) {
      button.textContent = theme === 'voxel' ? '像素' : '简约';
      button.setAttribute('aria-label', `当前${theme === 'voxel' ? '像素' : '简约'}风格，切换为${theme === 'voxel' ? '简约' : '像素'}风格`);
      button.title = button.getAttribute('aria-label');
    }
  };
  let saved;
  try { saved = localStorage.getItem(KEY); } catch { /* Still usable when storage is unavailable. */ }
  apply(saved);
  document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.site-header');
    if (!header) return;
    const actions = document.createElement('div');
    actions.className = 'header-actions';
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'theme-toggle';
    actions.append(button);
    const tools = header.querySelector('.tools');
    if (tools) actions.append(tools);
    header.append(actions);
    apply(document.documentElement.dataset.theme);
    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'voxel' ? 'simple' : 'voxel';
      apply(next);
      try { localStorage.setItem(KEY, next); }
      catch {
        if (typeof window.toast === 'function') window.toast('风格已切换；当前浏览器无法保存偏好。');
      }
    });
  }, { once: true });
  window.addEventListener('storage', event => { if (event.key === KEY || event.key === null) apply(event.newValue); });
})();
