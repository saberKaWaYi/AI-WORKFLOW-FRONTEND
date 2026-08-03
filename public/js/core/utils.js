export function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

export function formatText(template, values = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getCssColor(name, alpha, root = document.documentElement) {
  const color = getComputedStyle(root).getPropertyValue(name).trim();
  if (alpha == null) return color;
  return color.startsWith('#') ? `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}` : color;
}

export function seededPosition(index, text) {
  let hash = 2166136261;
  const value = `${text}:${index}`;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const x = ((hash >>> 0) % 10000) / 10000;
  hash = Math.imul(hash ^ 0x9e3779b9, 16777619);
  const y = ((hash >>> 0) % 10000) / 10000;
  return { x, y };
}

export function intersectSets(a, b) {
  return new Set([...a].filter((value) => b.has(value)));
}

export function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

