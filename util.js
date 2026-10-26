// Small DOM + data helpers shared by main.js and prs-table.js.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Create an element. attrs: class, text, and any attribute; children: nodes/strings. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Only allow absolute https links coming from data.json. */
export function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Only allow relative paths inside assets/ for images named in data.json. */
export function safeAsset(p) {
  return typeof p === 'string' && /^assets\/[\w./-]+$/.test(p) && !p.includes('..') ? p : null;
}

export const external = (href) => ({ href: safeUrl(href) || '#', target: '_blank', rel: 'noopener' });
export const newTabNote = () => h('span', { class: 'sr-only', text: ' (opens in a new tab)' });
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Logo image from a data.json logo key (file stem in assets/, shown in its
 *  original colours), or a monogram tile when the key is null. */
export function logoTile(logo, monogram, size = 56) {
  if (logo && /^[\w.-]+$/.test(logo)) {
    return h('img', {
      class: 'logo',
      src: `assets/${encodeURIComponent(logo)}.png`,
      alt: '',
      width: size,
      height: size,
      loading: 'lazy',
      decoding: 'async',
    });
  }
  return h('span', { class: 'mono-tile', 'aria-hidden': 'true', text: monogram || '' });
}

/** "owner/repo" from a GitHub URL, or null. */
export function repoFromUrl(u) {
  const href = safeUrl(u);
  if (!href) return null;
  const url = new URL(href);
  if (url.hostname !== 'github.com') return null;
  const [owner, repo] = url.pathname.split('/').filter(Boolean);
  return owner && repo ? `${owner}/${repo}` : null;
}

/** "owner/repo" for a contribution: from its ref ("owner/repo#123"), else its url. */
export function repoOf(item) {
  const m = /^([\w.-]+\/[\w.-]+)/.exec(item.ref || item.repo || '');
  return m ? m[1] : repoFromUrl(item.url);
}

/**
 * Builds a lookup from repo to { logo, monogram } using every place data.json
 * names a project (contributing_to and interests), so a project shows the same
 * logo wherever it appears on the page.
 */
export function projectResolver(data) {
  const byRepo = new Map();
  const add = (repo, logo, monogram) => {
    if (!repo) return;
    const key = repo.toLowerCase();
    const cur = byRepo.get(key) || {};
    byRepo.set(key, { logo: cur.logo || logo || null, monogram: cur.monogram || monogram || null });
  };
  (data.contributing_to || []).forEach((c) => add(c.repo, c.logo, c.monogram));
  (data.interests || []).forEach((a) => (a.projects || []).forEach((p) => add(repoFromUrl(p.url), p.logo, p.monogram)));

  const fallback = (name) => (name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
  return (item, name) => {
    const repo = repoOf(item);
    const hit = repo ? byRepo.get(repo.toLowerCase()) : null;
    // An item's own `logo` key wins (null there means: show the monogram).
    const own = Object.prototype.hasOwnProperty.call(item, 'logo');
    return {
      repo,
      logo: own ? item.logo || null : hit?.logo || null,
      monogram: item.monogram || hit?.monogram || fallback(name),
    };
  };
}
