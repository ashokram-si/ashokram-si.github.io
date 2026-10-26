// Pull requests: status filter tabs + paginated table (stacked cards on phones).
// State lives in the URL hash, e.g. #prs?status=merged&page=2, so views are
// shareable and the back button works.
import { $, $$, h, external, newTabNote, logoTile } from './util.js';

const PAGE_SIZE = 10;
const STATUS_ORDER = ['MERGED', 'IN REVIEW', 'AWAITING MAINTAINERS', 'CLOSED'];
const STATUS_CLASS = {
  'MERGED': 'merged',
  'IN REVIEW': 'review',
  'AWAITING MAINTAINERS': 'awaiting',
  'CLOSED': 'closed',
};

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sentence = (s) => { const t = String(s).toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
/** "owner/repo#123" with soft line-break points after "/" and before "#". */
const breakable = (ref) => String(ref || '').split(/([/#])/).flatMap((part) => {
  if (part === '/') return ['/', document.createElement('wbr')];
  if (part === '#') return [document.createElement('wbr'), '#'];
  return part ? [part] : [];
});
const typeOf = (c) => (c.feature ? 'FEATURE' : c.kind === 'comment' ? 'INVESTIGATION' : 'BUG FIX');

/**
 * @param {HTMLElement} root  the #prs section
 * @param {object[]} contributions  data.contributions
 * @param {object} opts
 * @param {(item:object, name:string)=>{logo:string|null, monogram:string}} opts.resolveProject
 * @param {boolean} opts.animate  GSAP available and motion allowed
 */
export function createPrTable(root, contributions, { resolveProject, animate }) {
  const gsap = window.gsap;
  // Newest first; for equal dates, later entries in data.json come first.
  const items = (contributions || [])
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.i - a.i);

  const present = new Set(items.map((c) => c.status).filter(Boolean));
  const statuses = [...STATUS_ORDER.filter((s) => present.has(s)), ...[...present].filter((s) => !STATUS_ORDER.includes(s))];
  const tabsDef = [
    { key: 'all', label: 'All', count: items.length },
    ...statuses.map((s) => ({ key: slug(s), status: s, label: sentence(s), count: items.filter((c) => c.status === s).length })),
  ];
  const validKeys = new Set(tabsDef.map((t) => t.key));

  const tablist = $('.prt-tabs', root);
  const panel = $('.prt-panel', root);
  const tbody = $('.prt tbody', root);
  const countEl = $('.prt-count', root);
  const pager = $('.pager', root);

  let state = { status: 'all', page: 1 };

  // ---- tabs
  const tabs = tabsDef.map((t) => h('button', {
    type: 'button',
    role: 'tab',
    class: 'prt-tab mono',
    id: `prs-tab-${t.key}`,
    'aria-controls': 'prs-panel',
    'aria-selected': 'false',
    tabindex: '-1',
    'data-key': t.key,
  }, h('span', { text: t.label }), h('span', { class: 'prt-tab__n', text: String(t.count) })));
  tablist.append(...tabs);

  tablist.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) select(tab.dataset.key);
  });
  tablist.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    tab.focus();
    select(tab.dataset.key);
  });

  function select(key) {
    if (key === state.status) return;
    setState({ status: key, page: 1 }, { push: true });
  }

  // ---- pager
  pager.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (!btn || btn.disabled) return;
    const page = Number(btn.dataset.page);
    setState({ ...state, page }, { push: true, focus: btn.dataset.role || 'num' });
    // Keep the top of the table in view when paging from the bottom.
    const top = root.querySelector('.prt-tabs').getBoundingClientRect().top;
    if (top < 0) root.querySelector('.prt-tabs').scrollIntoView({ block: 'start', behavior: animate ? 'smooth' : 'auto' });
  });

  // ---- state
  const filtered = () => (state.status === 'all' ? items : items.filter((c) => slug(c.status) === state.status));
  const pageCount = () => Math.max(1, Math.ceil(filtered().length / PAGE_SIZE));

  function setState(next, { push = false, focus = null, animateRows = true } = {}) {
    const status = validKeys.has(next.status) ? next.status : 'all';
    state = { status, page: 1 };
    state.page = Math.min(Math.max(1, Number(next.page) || 1), pageCount());
    if (push) writeHash();
    render(animateRows, focus);
  }

  function readHash() {
    const m = /^#prs(?:\?(.*))?$/.exec(location.hash);
    if (!m) return null;
    const p = new URLSearchParams(m[1] || '');
    return { status: p.get('status') || 'all', page: p.get('page') || 1 };
  }

  function writeHash() {
    const p = new URLSearchParams();
    if (state.status !== 'all') p.set('status', state.status);
    if (state.page > 1) p.set('page', String(state.page));
    const hash = `#prs${p.toString() ? `?${p}` : ''}`;
    if (location.hash !== hash) history.pushState(null, '', hash);
  }

  window.addEventListener('popstate', () => {
    const fromHash = readHash();
    if (fromHash) setState(fromHash);
    else if (!location.hash) setState({ status: 'all', page: 1 });
  });

  // ---- render
  function row(c) {
    const proj = resolveProject(c, c.project);
    const type = typeOf(c);
    const typeTag = (extra = '') => h('span', { class: `type type--${slug(type)}${extra}`, text: type });
    return h('tr', { class: 'prt-row', role: 'row' },
      h('td', { class: 'prt-proj', role: 'cell' },
        h('span', { class: 'prt-proj__in' },
          logoTile(proj.logo, proj.monogram, 36),
          h('span', { class: 'prt-proj__name', text: c.project }))),
      h('td', { class: 'prt-what', role: 'cell' },
        h('p', { class: 'prt-what__text', title: c.what, text: c.what }),
        typeTag(' type--inline')),
      h('td', { class: 'prt-type', role: 'cell' }, typeTag()),
      h('td', { class: 'prt-link', role: 'cell' },
        h('a', { class: 'prt-ref mono', ...external(c.url) },
          breakable(c.ref), h('span', { 'aria-hidden': 'true', text: ' ↗' }), newTabNote())),
      h('td', { class: 'prt-status', role: 'cell' },
        h('span', { class: `pill pill--${STATUS_CLASS[c.status] || 'awaiting'}`, text: c.status })),
      h('td', { class: 'prt-date mono', role: 'cell' },
        h('time', { datetime: c.date, text: c.date })),
    );
  }

  function render(animateRows, focus) {
    tabs.forEach((t) => {
      const on = t.dataset.key === state.status;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `prs-tab-${state.status}`);

    const list = filtered();
    const start = (state.page - 1) * PAGE_SIZE;
    const rows = list.slice(start, start + PAGE_SIZE).map(row);
    tbody.replaceChildren(...rows);
    countEl.textContent = list.length
      ? `Showing ${start + 1}–${start + rows.length} of ${list.length}`
      : 'No entries with this status';

    renderPager(focus);

    if (animateRows && animate && gsap && rows.length) {
      gsap.fromTo(rows, { opacity: 0, y: 10 }, {
        opacity: 1, y: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out', clearProps: 'opacity,transform',
      });
    }
  }

  function pageList(total, cur) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const set = new Set([1, total, cur - 1, cur, cur + 1].filter((p) => p >= 1 && p <= total));
    const out = [];
    [...set].sort((a, b) => a - b).forEach((p, i, arr) => {
      if (i && p - arr[i - 1] > 1) out.push('…');
      out.push(p);
    });
    return out;
  }

  function renderPager(focus) {
    const total = pageCount();
    pager.hidden = total <= 1;
    if (total <= 1) { pager.replaceChildren(); return; }
    const cur = state.page;
    const btn = (label, page, role, extra = {}) => h('button', {
      type: 'button', class: `pager__btn mono${role === 'num' ? '' : ' pager__btn--step'}`,
      'data-page': page, 'data-role': role, ...extra,
    }, label);
    pager.replaceChildren(
      btn('← Prev', cur - 1, 'prev', { disabled: cur === 1, 'aria-label': 'Previous page' }),
      h('span', { class: 'pager__nums' },
        pageList(total, cur).map((p) => (p === '…'
          ? h('span', { class: 'pager__gap', 'aria-hidden': 'true', text: '…' })
          : btn(String(p), p, 'num', { 'aria-label': `Page ${p}`, 'aria-current': p === cur ? 'page' : null })))),
      btn('Next →', cur + 1, 'next', { disabled: cur === total, 'aria-label': 'Next page' }),
    );
    if (focus) {
      const target = focus === 'num'
        ? pager.querySelector('[aria-current="page"]')
        : pager.querySelector(`[data-role="${focus}"]:not([disabled])`) || pager.querySelector('[aria-current="page"]');
      if (target) target.focus();
    }
  }

  // ---- initial state (from the URL if it targets this section)
  const initial = readHash();
  setState(initial || { status: 'all', page: 1 }, { animateRows: false });

  return { rows: () => $$('.prt-row', tbody) };
}
