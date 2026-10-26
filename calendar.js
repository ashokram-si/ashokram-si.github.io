// GitHub-style contribution calendar in the site's colours.
// data.calendar = { total, weeks: [[{ date, count, level 0-4, weekday 0=Sun..6 }]] }, oldest week first.
import { $, h } from './util.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse "YYYY-MM-DD" as a calendar date (UTC, so no timezone shift). */
const parse = (iso) => new Date(`${iso}T00:00:00Z`);
const longDate = (iso) => {
  const d = parse(iso);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const describe = (day) => {
  const n = Number(day.count) || 0;
  const when = longDate(day.date);
  return n === 0 ? `No contributions on ${when}` : `${n} contribution${n === 1 ? '' : 's'} on ${when}`;
};

/**
 * Renders the calendar into `root` (the #activity section). Returns the day
 * cells (for the reveal animation), or null when there is no calendar data.
 */
export function renderCalendar(root, calendar) {
  const weeks = calendar && Array.isArray(calendar.weeks) ? calendar.weeks.filter(Array.isArray) : [];
  if (!weeks.length) {
    root.hidden = true;
    document.querySelectorAll('a[href="#activity"]').forEach((a) => a.closest('li')?.setAttribute('hidden', ''));
    return null;
  }

  const total = Number(calendar.total) || 0;
  $('.cal__total', root).replaceChildren(
    h('strong', { text: total.toLocaleString('en-GB') }),
    ` contribution${total === 1 ? '' : 's'} in the last year`,
  );

  const grid = $('.cal__grid', root);
  grid.style.setProperty('--weeks', weeks.length);

  // Month labels: at the first week whose first day starts a new month. Like
  // GitHub, drop a label that would sit too close to the next one.
  const labels = [];
  weeks.forEach((week, col) => {
    const first = week[0];
    if (!first || !first.date) return;
    const m = parse(first.date).getUTCMonth();
    if (!labels.length || labels[labels.length - 1].m !== m) labels.push({ m, col });
  });
  for (let i = labels.length - 2; i >= 0; i--) {
    if (labels[i + 1].col - labels[i].col < 3) labels.splice(i, 1);
  }
  labels.forEach(({ m, col }) => grid.append(h('span', {
    class: 'cal__month mono', 'aria-hidden': 'true', style: `grid-column: ${col + 2} / span 3`, text: MONTHS[m],
  })));

  // Day labels (Mon / Wed / Fri)
  [1, 3, 5].forEach((wd) => grid.append(h('span', {
    class: 'cal__wd mono', 'aria-hidden': 'true', style: `grid-row: ${wd + 2}`, text: DAYS[wd],
  })));

  const today = localToday();
  const lastDate = weeks[weeks.length - 1].slice(-1)[0]?.date;
  const todayDate = weeks.some((w) => w.some((d) => d.date === today)) ? today : lastDate;

  const cells = [];
  weeks.forEach((week, col) => {
    week.forEach((day) => {
      const wd = Number.isInteger(day.weekday) ? day.weekday : parse(day.date).getUTCDay();
      const level = Math.min(4, Math.max(0, Number(day.level) || 0));
      const label = describe(day);
      const cell = h('span', {
        class: `cal__day cal__day--l${level}${day.date === todayDate ? ' is-today' : ''}`,
        role: 'img',
        'aria-label': label,
        'data-tip': label,
        'data-col': col,
        style: `grid-column: ${col + 2}; grid-row: ${wd + 2}`,
        // Days with activity are keyboard-focusable so their tooltip can be read.
        tabindex: Number(day.count) > 0 ? '0' : null,
      });
      cells.push(cell);
    });
  });
  grid.append(...cells);

  setupTooltip(root, grid);

  // Start scrolled to the most recent weeks when the grid is wider than its box.
  const scroller = $('.cal__scroll', root);
  const toEnd = () => { scroller.scrollLeft = scroller.scrollWidth; };
  toEnd();
  new ResizeObserver(toEnd).observe(scroller);

  return cells;
}

function setupTooltip(root, grid) {
  const tip = $('.cal__tip', root);
  const box = $('.cal', root);
  const show = (cell) => {
    tip.textContent = cell.dataset.tip;
    tip.hidden = false;
    const b = box.getBoundingClientRect();
    const r = cell.getBoundingClientRect();
    const w = tip.offsetWidth;
    const x = Math.min(Math.max(r.left + r.width / 2 - b.left - w / 2, 4), b.width - w - 4);
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(r.top - b.top - tip.offsetHeight - 8)}px)`;
  };
  const hide = () => { tip.hidden = true; };
  grid.addEventListener('pointerover', (e) => { const c = e.target.closest('.cal__day'); if (c) show(c); });
  grid.addEventListener('pointerleave', hide);
  grid.addEventListener('focusin', (e) => { const c = e.target.closest('.cal__day'); if (c) show(c); });
  grid.addEventListener('focusout', hide);
  $('.cal__scroll', root).addEventListener('scroll', hide, { passive: true });
}
