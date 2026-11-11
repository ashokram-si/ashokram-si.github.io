// Ashok Ram · portfolio
// Renders every piece of content from data.json, then layers on GSAP motion and
// the three.js hero. Content never depends on WebGL or on GSAP being present.

import { $, $$, h, safeUrl, safeAsset, external, newTabNote, plural, logoTile, projectResolver } from './util.js';
import { createPrTable } from './prs-table.js';
import { renderCalendar } from './calendar.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const animate = Boolean(gsap && ScrollTrigger) && !reduceMotion;
if (animate) gsap.registerPlugin(ScrollTrigger);

// ----------------------------------------------------------------- render

function bindBasics(data) {
  $$('[data-bind="handle"]').forEach((el) => { el.textContent = data.handle; });
  $$('[data-bind="handle-id"]').forEach((el) => { el.textContent = `ID // ${data.handle}`; });
  const profile = safeUrl(data.profile);
  $$('[data-bind-href="profile"]').forEach((el) => { if (profile) el.href = profile; });
  $$('[data-bind="profile-text"]').forEach((el) => {
    el.textContent = profile ? profile.replace(/^https:\/\//, '').replace(/\/$/, '') : data.handle;
  });
}

function renderHero(data) {
  const name = $('.hero__name');
  name.append(h('span', { class: 'sr-only', text: data.name }));
  const visual = h('span', { 'aria-hidden': 'true' });
  data.name.split(/\s+/).forEach((word) => {
    const line = h('span', { class: 'line' });
    [...word].forEach((ch) => line.append(h('span', { class: 'ch', 'data-ch': ch, text: ch })));
    visual.append(line);
  });
  name.append(visual);

  $('.hero__handle').textContent = data.handle;
  $('.hero__tagline').textContent = data.tagline;
  // The projects that merged my work, most recent first (data.shipped_to): who I am in
  // their logos. Each opens my merged pull requests there.
  const shipped = data.shipped_to || [];
  $('[data-count="shipped"]').textContent = plural(shipped.length, 'project', 'projects');
  $('.shipped').append(...shipped.map((p) => h('li', {},
    h('a', { ...external(`https://github.com/${p.repo}/pulls?q=is%3Apr+author%3A${encodeURIComponent(data.handle)}+is%3Amerged`), title: p.name },
      logoTile(p.logo, (p.name || '?').slice(0, 2).toUpperCase(), 40),
      h('span', { class: 'sr-only', text: p.name }),
      newTabNote()))));
}

const TIER = ['', 'bronze', 'silver', 'gold'];

/** GitHub's achievements, one card each: the official artwork in a turning ring, the tier as
 *  pips and a chip, the pull request that unlocked it, and a bar to the next tier. */
function renderAchievements(data) {
  const badges = (data.github_achievements || []).filter((b) => safeAsset(b.image));
  if (!badges.length) { $('#achievements').hidden = true; return; }
  $('[data-count="achievements"]').textContent = `${badges.length} earned`;
  $('.ach').append(...badges.map((b) => {
    const level = Number(b.level) || 1;
    const tiers = Number(b.tiers) || 1;
    const label = tiers > 1 && level > 1 ? `x${level} · ${TIER[level - 1] || ''}` : 'unlocked';
    const pips = tiers > 1 ? h('span', { class: 'ach__pips', 'aria-label': `tier ${level} of ${tiers}` },
      ...Array.from({ length: tiers }, (_, k) => h('i', { class: k < level ? 'is-on' : '' }))) : null;
    const next = Number(b.next) || 0;
    const progress = next ? h('span', { class: 'ach__progress' },
      h('span', { class: 'mono ach__count' }, h('b', { text: String(b.count) }), ` / ${next} ${b.unit} → x${level + 1}`),
      h('span', { class: 'ach__bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(next), 'aria-valuenow': String(b.count), 'aria-label': `${b.count} of ${next} ${b.unit}` },
        h('span', { style: `--p:${Math.max(4, Math.min(100, (100 * b.count) / next)).toFixed(1)}%` })))
      : h('span', { class: 'ach__progress mono', text: 'top tier reached' });
    return h('li', {},
      h('a', { class: 'ach__card hud', ...external(b.url) },
        h('span', { class: 'ach__art' },
          h('img', { src: safeAsset(b.image), alt: '', width: 112, height: 112, decoding: 'async', loading: 'lazy' }), pips),
        h('span', { class: 'ach__body' },
          h('span', { class: 'ach__name', text: b.name }),
          h('span', { class: `ach__tier mono${level > 1 ? ' is-solid' : ''}`, text: label }),
          h('span', { class: 'ach__how mono', text: `unlocked ${b.earned}${b.unlocked_by ? ` · ${b.unlocked_by}` : ''}` }),
          progress),
        newTabNote()));
  }));
}

/** The languages I ship in: a spectrum of the pull requests by project language, then a row
 *  each with a bar and the projects it went to; skills without a pull request yet as a line. */
function renderLanguages(data, resolveProject) {
  const langs = (data.languages || []).filter((l) => l.prs > 0);
  const other = (data.languages || []).filter((l) => !l.prs);
  if (!langs.length) { $('#languages').hidden = true; return; }
  const total = langs.reduce((n, l) => n + l.prs, 0);
  const most = langs[0].prs;
  $('[data-count="languages"]').textContent = `${total} PRs · ${langs.length} languages`;
  const spectrum = $('.langs__spectrum');
  spectrum.setAttribute('aria-label', 'Share of pull requests: ' + langs.map((l) => `${l.name} ${Math.round((100 * l.prs) / total)}%`).join(', '));
  spectrum.append(...langs.map((l, i) => h('span', { class: `tone-${i % 8}`, style: `--w:${((100 * l.prs) / total).toFixed(2)}%`, title: `${l.name}: ${plural(l.prs, 'PR', 'PRs')}` })));
  $('.langs__rows').append(...langs.map((l, i) => {
    const icon = safeAsset(l.logo)
      ? h('img', { class: 'langs__logo', src: safeAsset(l.logo), alt: '', width: 32, height: 32, decoding: 'async' })
      : h('span', { class: 'langs__logo langs__logo--glyph', 'aria-hidden': 'true', text: '✦' });
    const projects = l.projects || [];
    return h('li', { class: 'langs__row' },
      icon,
      h('span', { class: 'langs__name' },
        h('b', {}, h('i', { class: `langs__key tone-${i % 8}`, 'aria-hidden': 'true' }), l.name),
        h('small', { class: 'mono', text: `${plural(l.prs, 'PR', 'PRs')} · ${plural(projects.length, 'project', 'projects')}` })),
      h('span', { class: 'langs__bar', 'aria-hidden': 'true' }, h('span', { style: `--p:${Math.max(3, (100 * l.prs) / most).toFixed(1)}%` })),
      h('b', { class: 'langs__n mono', 'aria-hidden': 'true', text: String(l.prs) }),
      h('ul', { class: 'langs__projects', 'aria-label': `${l.name} projects` }, ...projects.map((p) => {
        const r = resolveProject({ repo: p.repo, logo: p.logo }, p.name);
        return h('li', { title: p.name }, logoTile(r.logo, r.monogram, 28), h('span', { class: 'sr-only', text: p.name }));
      })));
  }));
  if (other.length) {
    const also = $('.langs__also');
    also.hidden = false;
    also.querySelector('span').textContent = other.map((l) => l.name).join(', ');
  }
}

function renderStats(data) {
  // Four counters, picked by label from data.stats, shown with their own labels.
  const entries = Object.entries(data.stats || {});
  const wanted = [/opened/i, /^merged$/i, /review/i, /projects/i];
  const picked = wanted
    .map((re) => entries.find(([k]) => re.test(k)))
    .filter(Boolean);

  $('.stats').append(...picked.map(([label, value], i) => {
    const n = parseInt(String(value).replace(/[^\d]/g, ''), 10) || 0;
    return h('li', { class: 'stat' },
      h('span', { class: 'sr-only', text: `${value} ${label}` }),
      h('span', { class: 'stat__idx mono', 'aria-hidden': 'true', text: `0${i + 1} /` }),
      h('span', { class: 'stat__num', 'aria-hidden': 'true', 'data-target': n, text: String(n) }),
      h('span', { class: 'stat__label mono', 'aria-hidden': 'true', text: label }),
    );
  }));
}

const STATE_BADGE = {
  listed: ['In contributors list', 'listed'],
  merged: ['Merged commits', 'merged'],
  review: ['PR in review', 'review'],
  closed: ['PR closed', 'closed'],
  investigation: ['Investigation posted', 'investigation'],
};

function renderContributing(data, resolveProject) {
  const list = data.contributing_to || [];
  $('[data-count="contributing"]').textContent = plural(list.length, 'repository', 'repositories');

  $('.cards').append(...list.map((c) => {
    const counts = [
      [c.prs, 'PR', 'PRs'],
      [c.merged, 'merged', 'merged'],
      [c.features, 'feature', 'features'],
      [c.closed, 'closed', 'closed'],
      [c.comments, 'investigation', 'investigations'],
    ].filter(([n]) => Number(n) > 0)
      .map(([n, one, many]) => h('li', {}, h('b', { text: n }), n === 1 ? one : many));

    const badge = STATE_BADGE[c.state];
    return h('li', {},
      h('a', { class: 'card hud', ...external(c.link) },
        h('span', { class: 'card__glare', 'aria-hidden': 'true' }),
        h('div', { class: 'card__inner' },
          h('div', { class: 'card__top' },
            (({ logo, monogram }) => logoTile(logo, monogram))(resolveProject(c, c.name)),
            badge ? h('span', { class: `badge badge--${badge[1]}`, text: badge[0] }) : null,
          ),
          h('h3', { class: 'card__name', text: c.name }),
          h('p', { class: 'card__repo mono', text: c.repo }),
          counts.length ? h('ul', { class: 'card__counts mono' }, counts) : null,
          h('span', { class: 'card__go mono', 'aria-hidden': 'true', text: 'open on GitHub ↗' }),
        ),
        newTabNote(),
      ),
    );
  }));
}

function renderContributions(data, resolveProject) {
  $('[data-count="contributions"]').textContent = plural((data.contributions || []).length, 'entry', 'entries');
  return createPrTable($('#prs'), data.contributions, { resolveProject, animate });
}

function renderInterests(data) {
  const areas = data.interests || [];
  const total = areas.reduce((n, a) => n + (a.projects || []).length, 0);
  $('[data-count="interests"]').textContent = plural(total, 'project', 'projects');

  $('.wall').append(...areas.map((area, gi) => {
    const id = `area-${gi}`;
    return h('section', { class: 'wall__group', 'aria-labelledby': id },
      h('h3', { class: 'wall__area', id },
        area.area, h('span', { text: String((area.projects || []).length) })),
      h('ul', { class: 'wall__grid' },
        (area.projects || []).map((p) => h('li', {},
          h('a', { class: 'tile hud', ...external(p.url) },
            logoTile(p.logo, p.monogram, 52),
            h('span', { class: 'tile__name', text: p.name }),
            newTabNote(),
          ),
        )),
      ),
    );
  }));
}

function renderHowIWork(data) {
  $('.term__list').append(...(data.how_i_work || []).map((item) => h('li', {},
    h('span', { class: 'term__chk', 'aria-hidden': 'true', text: '[✓]' }),
    h('span', {}, h('strong', { text: item.title }), ` — ${item.text}`),
  )));
}

// ----------------------------------------------------------- hero 3D

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

function useFallbackHero() {
  $('.hero').classList.add('no-webgl');
  const label = $('[data-hud="render"]');
  if (label) label.textContent = 'render: svg fallback';
}

async function startHero3D() {
  if (!webglAvailable()) return useFallbackHero();
  try {
    const { createHero } = await import('./hero3d.js');
    const pointerLabel = $('[data-hud="pointer"]');
    const renderLabel = $('[data-hud="render"]');
    const fmt = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
    const hero = createHero($('#hero-canvas'), {
      reduce: reduceMotion,
      anchor: $('.avatar-slot'),
      mask: $('.hero__text'),
      watch: [$('.hero__inner'), $('.hero__text')],
      onPointer: (x, y) => { pointerLabel.textContent = `x ${fmt(x)} · y ${fmt(y)}`; },
      onFps: (fps) => { renderLabel.textContent = `render: webgl · ${fps} fps`; },
      onLost: useFallbackHero,
    });
    if (reduceMotion) renderLabel.textContent = 'render: webgl · static';
    window.addEventListener('pagehide', (e) => { if (!e.persisted) hero.destroy(); });
  } catch (err) {
    console.warn('Hero 3D unavailable, using fallback.', err);
    useFallbackHero();
  }
}

// -------------------------------------------------------------- motion

const GLYPHS = '!<>-_\\/[]{}=+*^?#01ABCDEFXYZ';

/** Typing effect for an element with data-text. Returns a tween. */
function typeTween(el, duration = 0.6) {
  const text = el.dataset.text || el.textContent;
  const state = { n: 0 };
  el.textContent = '';
  return gsap.to(state, {
    n: text.length,
    duration,
    ease: `steps(${text.length})`,
    onUpdate: () => { el.textContent = text.slice(0, Math.round(state.n)); },
  });
}

/** Scramble each .ch span from random glyphs to its real character. */
function scrambleTween(chars, duration = 1.1) {
  const state = { p: 0 };
  const n = chars.length;
  return gsap.to(state, {
    p: 1,
    duration,
    ease: 'none',
    onUpdate: () => {
      chars.forEach((el, i) => {
        const settle = (i + 1) / (n + 1);
        el.textContent = state.p >= settle
          ? el.dataset.ch
          : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      });
    },
    onComplete: () => chars.forEach((el) => { el.textContent = el.dataset.ch; }),
  });
}

function introTimeline() {
  const chars = $$('.hero__name .ch');
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  document.documentElement.classList.add('is-ready');

  tl.from('.hero__frame .corner', { scale: 0, opacity: 0, duration: 0.6, stagger: 0.06, transformOrigin: 'center' })
    .from('.hero__label', { opacity: 0, duration: 0.5, stagger: 0.08 }, '<0.2')
    .from('.whoami', { opacity: 0, duration: 0.2 }, 0.15)
    .add(typeTween($('.whoami__cmd'), 0.55), 0.3)
    .from(chars, { yPercent: 115, duration: 0.9, stagger: 0.045, ease: 'expo.out' }, 0.75)
    .add(scrambleTween(chars, 1.0), 0.75)
    .add(() => $('.hero__name').classList.add('is-marked'), 1.25)
    .from('.hero__handle', { opacity: 0, x: -14, duration: 0.6 }, 1.2)
    .from('.hero__tagline', { opacity: 0, y: 18, duration: 0.8 }, 1.3)
    .from('.hero__cap', { opacity: 0, duration: 0.4, stagger: 0.1 }, 1.4)
    .from('.shipped li', { opacity: 0, y: 10, duration: 0.45, stagger: 0.04 }, 1.45)
    .from('.hero__cta .btn', { opacity: 0, y: 12, duration: 0.5, stagger: 0.08 }, 1.6)
    .from('.avatar', { scale: 0.7, opacity: 0, rotate: -25, duration: 1.4, ease: 'expo.out' }, 0.35)
    .from('.avatar__cap', { opacity: 0, y: 8, duration: 0.5 }, 1.4)
    .from('.hero__scroll', { opacity: 0, y: -8, duration: 0.6 }, 1.9);
  return tl;
}

function sectionHeads() {
  $$('.sec-head').forEach((head) => {
    const tl = gsap.timeline({ scrollTrigger: { trigger: head, start: 'top 85%', once: true } });
    tl.from(head.querySelector('.sec-head__idx'), { opacity: 0, x: -16, duration: 0.5, ease: 'power2.out' })
      .from(head.querySelector('.sec-head__title'), { opacity: 0, yPercent: 40, duration: 0.8, ease: 'expo.out' }, '<0.05')
      .from(head.querySelector('.sec-head__rule'), { scaleX: 0, transformOrigin: '0 50%', duration: 1, ease: 'expo.out' }, '<0.1');
  });
}

function statsMotion() {
  const items = $$('.stat');
  gsap.from(items, {
    opacity: 0,
    y: 24,
    duration: 0.7,
    stagger: 0.1,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.stats', start: 'top 80%', once: true },
  });
  items.forEach((item, i) => {
    const num = item.querySelector('.stat__num');
    const target = Number(num.dataset.target) || 0;
    const state = { v: 0 };
    num.textContent = '0';
    gsap.to(state, {
      v: target,
      duration: 1.4 + Math.min(target, 40) * 0.02,
      delay: i * 0.12,
      ease: 'power2.out',
      onUpdate: () => { num.textContent = String(Math.round(state.v)); },
      onStart: () => item.classList.add('is-in'),
      scrollTrigger: { trigger: '.stats', start: 'top 80%', once: true },
    });
  });

  // Portrait: one Sunstruck scan sweep the first time it comes into view.
  const scan = $('.portrait__scan');
  const stack = $('.portrait__stack');
  gsap.timeline({ scrollTrigger: { trigger: stack, start: 'top 75%', once: true } })
    .from('.portrait', { opacity: 0, y: 30, duration: 0.9, ease: 'power3.out' })
    .fromTo(scan, { top: '0%', opacity: 1 }, { top: '100%', duration: 1.3, ease: 'power1.inOut' }, 0.2)
    .fromTo(stack, { '--r': '0%', '--x': '50%', '--y': '0%' },
      { '--r': '160%', '--y': '100%', duration: 1.3, ease: 'power1.inOut' }, 0.2)
    .to(stack, { '--r': '0%', duration: 0.7, ease: 'power2.in' })
    .to(scan, { opacity: 0, duration: 0.3 }, '<');
}

/** The achievement and language rows rise in, and their bars fill, as they scroll into view
 *  (CSS draws everything in place without this). */
function revealMotion() {
  ScrollTrigger.batch('.ach > li, .langs__row', {
    start: 'top 90%',
    once: true,
    onEnter: (batch) => gsap.from(batch, { opacity: 0, y: 24, duration: 0.6, stagger: 0.07, ease: 'power3.out' }),
  });
  $$('.ach__bar > span, .langs__bar > span, .langs__spectrum > span').forEach((el) => {
    gsap.from(el, { scaleX: 0, transformOrigin: 'left center', duration: 1.1, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
  });
}

function cardsMotion() {
  ScrollTrigger.batch('.cards > li', {
    start: 'top 88%',
    once: true,
    onEnter: (batch) => gsap.from(batch, {
      opacity: 0,
      y: 40,
      rotateX: -12,
      transformOrigin: '50% 100%',
      duration: 0.8,
      stagger: 0.09,
      ease: 'power3.out',
    }),
  });
}

function prsMotion(table) {
  gsap.from('.prt-tabs .prt-tab', {
    opacity: 0, y: 10, duration: 0.4, stagger: 0.06, ease: 'power2.out',
    scrollTrigger: { trigger: '.prt-tabs', start: 'top 88%', once: true },
  });
  gsap.from(table.rows(), {
    opacity: 0, y: 14, duration: 0.5, stagger: 0.06, ease: 'power3.out', clearProps: 'opacity,transform',
    scrollTrigger: { trigger: '.prt-panel', start: 'top 85%', once: true },
  });
}

function calendarMotion(cells) {
  // Column-by-column reveal, oldest week first.
  gsap.from(cells, {
    opacity: 0,
    scale: 0.3,
    duration: 0.35,
    ease: 'back.out(2)',
    stagger: (i, el) => Number(el.dataset.col) * 0.022,
    clearProps: 'opacity,transform',
    scrollTrigger: { trigger: '.cal', start: 'top 82%', once: true },
  });
}

function wallMotion() {
  // A Sunstruck scan line sweeps down the wall; each tile flickers on as it passes.
  const wall = $('.wall');
  const scan = $('.wall__scan');
  const tiles = $$('.tile', wall);
  const sweep = 1.8;
  gsap.set(tiles, { opacity: 0 });
  ScrollTrigger.create({
    trigger: wall,
    start: 'top 78%',
    once: true,
    onEnter: () => {
      const height = wall.offsetHeight;
      // Animate `top` (not a transform) so the line never extends the page's scroll height.
      gsap.fromTo(scan, { top: '0%', opacity: 1 }, {
        top: '100%',
        duration: sweep,
        ease: 'none',
        onComplete: () => gsap.to(scan, { opacity: 0, duration: 0.3, onComplete: () => gsap.set(scan, { display: 'none' }) }),
      });
      tiles.forEach((tile) => {
        const top = tile.getBoundingClientRect().top - wall.getBoundingClientRect().top;
        gsap.fromTo(tile, { opacity: 0, y: 8 }, {
          opacity: 1,
          y: 0,
          duration: 0.4,
          delay: Math.max(0, (top / height) * sweep - 0.05) + Math.random() * 0.12,
          ease: 'steps(4)',
          clearProps: 'transform',
        });
      });
    },
  });
}

function termMotion() {
  const typed = $('.term__typed');
  const lines = $$('.term__list li');
  const end = $('.term__cmd--end');
  const tl = gsap.timeline({ scrollTrigger: { trigger: '.term', start: 'top 78%', once: true } });
  tl.from('.term', { opacity: 0, y: 30, duration: 0.7, ease: 'power3.out' })
    .add(typeTween(typed, 0.8), 0.3)
    .from(lines, { opacity: 0, x: -12, duration: 0.35, stagger: 0.16, ease: 'power2.out' })
    .from(lines.map((l) => l.querySelector('.term__chk')), { color: 'transparent', duration: 0.01, stagger: 0.16 }, '<0.15')
    .from(end, { opacity: 0, duration: 0.2 });
}

function footerMotion() {
  gsap.from('.foot__inner > *', {
    opacity: 0,
    y: 16,
    duration: 0.6,
    stagger: 0.1,
    ease: 'power2.out',
    scrollTrigger: { trigger: '.foot', start: 'top 95%', once: true },
  });
}

// ------------------------------------------------------- interactions

function setupTilt() {
  if (!animate || !finePointer) return;
  $$('.card').forEach((card) => {
    gsap.set(card, { transformPerspective: 900 });
    const rx = gsap.quickTo(card, 'rotationX', { duration: 0.5, ease: 'power3.out' });
    const ry = gsap.quickTo(card, 'rotationY', { duration: 0.5, ease: 'power3.out' });
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      rx((0.5 - py) * 14);
      ry((px - 0.5) * 16);
      card.style.setProperty('--mx', `${px * 100}%`);
      card.style.setProperty('--my', `${py * 100}%`);
    });
    card.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
}

function setupPortrait() {
  const stack = $('.portrait__stack');
  const hint = $('.portrait__hint');
  if (!finePointer) hint.textContent = 'tap to scan';
  const setR = (r, duration = 0.6) => {
    if (animate) gsap.to(stack, { '--r': r, duration, ease: 'power3.out', overwrite: 'auto' });
    else stack.style.setProperty('--r', r);
  };
  const setXY = (e) => {
    const r = stack.getBoundingClientRect();
    stack.style.setProperty('--x', `${((e.clientX - r.left) / r.width) * 100}%`);
    stack.style.setProperty('--y', `${((e.clientY - r.top) / r.height) * 100}%`);
  };
  if (finePointer) {
    stack.addEventListener('pointerenter', (e) => { setXY(e); setR('34%'); });
    stack.addEventListener('pointermove', setXY);
    stack.addEventListener('pointerleave', () => setR('0%', 0.5));
  } else {
    let on = false;
    stack.addEventListener('click', (e) => {
      on = !on;
      setXY(e);
      setR(on ? '150%' : '0%', 0.9);
    });
  }
}

/** Compact section menu for narrow screens (≤1000px, see style.css). */
function setupNavMenu() {
  const bar = $('.nav');
  const toggle = $('.nav__toggle');
  const menu = $('#nav-menu');
  if (!toggle || !menu) return;
  const setOpen = (open, { focusToggle = false } = {}) => {
    bar.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (!open && focusToggle) toggle.focus();
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bar.classList.contains('is-open')) setOpen(false, { focusToggle: true });
  });
  document.addEventListener('click', (e) => {
    if (bar.classList.contains('is-open') && !bar.contains(e.target)) setOpen(false);
  });
  window.matchMedia('(min-width: 1001px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
}

function setupScrollProgress() {
  const bar = $('.nav__progress span');
  let queued = false;
  const update = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
  };
  window.addEventListener('scroll', () => {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
}

function setupNavSpy() {
  const links = new Map($$('.nav__links a').map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const link = links.get(entry.target.id);
      if (!link) return;
      if (entry.isIntersecting) {
        links.forEach((l) => l.removeAttribute('aria-current'));
        link.setAttribute('aria-current', 'true');
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
}

// ---------------------------------------------------------------- boot

async function loadData() {
  const res = await fetch('data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`data.json: HTTP ${res.status}`);
  return res.json();
}

async function init() {
  let data;
  try {
    data = await loadData();
  } catch (err) {
    console.error(err);
    document.documentElement.classList.add('is-ready');
    $('#main').prepend(h('p', {
      class: 'container load-error mono',
      text: 'Could not load data.json. Serve this folder over HTTP to view the page.',
    }));
    return;
  }

  const resolveProject = projectResolver(data);
  bindBasics(data);
  renderHero(data);
  renderAchievements(data);
  renderStats(data);
  const calCells = renderCalendar($('#activity'), data.calendar);
  renderContributing(data, resolveProject);
  renderLanguages(data, resolveProject);
  const prTable = renderContributions(data, resolveProject);
  renderInterests(data);
  renderHowIWork(data);

  startHero3D();
  setupScrollProgress();
  setupNavMenu();
  setupNavSpy();
  setupPortrait();

  if (animate) {
    introTimeline();
    sectionHeads();
    statsMotion();
    cardsMotion();
    revealMotion();
    prsMotion(prTable);
    if (calCells) calendarMotion(calCells);
    wallMotion();
    termMotion();
    footerMotion();
    setupTilt();
    // Logos and fonts change heights after load; keep trigger positions right.
    window.addEventListener('load', () => ScrollTrigger.refresh());
    if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());
  } else {
    document.documentElement.classList.add('is-ready');
    $('.hero__name').classList.add('is-marked');
    $$('.stat').forEach((s) => s.classList.add('is-in'));
  }
}

/** Content is rendered after load, so the browser's own jump to #section (or
 *  #prs?status=…) happens too early; redo it once everything is in place. */
function scrollToHashTarget() {
  const id = decodeURIComponent(location.hash.slice(1).split('?')[0]);
  const el = id && document.getElementById(id);
  if (el && id !== 'top') el.scrollIntoView({ block: 'start', behavior: 'instant' });
}

init().then(scrollToHashTarget);
