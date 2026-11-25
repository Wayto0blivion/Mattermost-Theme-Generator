const $ = id => document.getElementById(id);

const GROUPS = [
  ['Sidebar', [
    ['sidebarBg', 'Channel list background'],
    ['sidebarText', 'Read channel names'],
    ['sidebarUnreadText', 'Unread channel names'],
    ['sidebarTextHoverBg', 'Row under the pointer'],
    ['sidebarTextActiveBorder', 'Marker beside the open channel'],
    ['sidebarTextActiveColor', 'Open channel name'],
    ['sidebarHeaderBg', 'Team name header'],
    ['sidebarHeaderTextColor', 'Team name and top bar text'],
    ['sidebarTeamBarBg', 'Top bar and team switcher'],
  ]],
  ['Channel', [
    ['centerChannelBg', 'Message area background'],
    ['centerChannelColor', 'Message text'],
    ['linkColor', 'Links'],
    ['buttonBg', 'Primary buttons'],
    ['buttonColor', 'Button labels'],
    ['errorTextColor', 'Error messages'],
    ['newMessageSeparator', 'New Messages line'],
  ]],
  ['Mentions', [
    ['mentionBg', 'Unread badge (also saved as mentionBj)'],
    ['mentionColor', 'Number on the badge'],
    ['mentionHighlightBg', 'Highlight behind your @mention'],
    ['mentionHighlightLink', 'Your @mention text'],
  ]],
  ['Status', [
    ['onlineIndicator', 'Online'],
    ['awayIndicator', 'Away'],
    ['dndIndicator', 'Do Not Disturb'],
  ]],
];
const COLOR_KEYS = GROUPS.flatMap(g => g[1].map(s => s[0]));
const ORIGINAL = {"awayIndicator":"#e9ff00","buttonBg":"#ff9f1c","buttonColor":"#ffffff","centerChannelBg":"#2ec4b6","centerChannelColor":"#cbf3f0","codeTheme":"#000000","dndIndicator":"#000000","errorTextColor":"#cbf3f0","linkColor":"#000000","mentionBg":"#2ec4b6","mentionBj":"#ffffff","mentionColor":"#ff9f1c","mentionHighlightBg":"#2ec4b6","mentionHighlightLink":"#ff9f1c","newMessageSeparator":"#ffbf69","onlineIndicator":"#00ff37","sidebarBg":"#ffffff","sidebarHeaderBg":"#ff9f1c","sidebarHeaderTextColor":"#ffffff","sidebarTeamBarBg":"#2ec4b6","sidebarText":"#2ec4b6","sidebarTextActiveBorder":"#cbf3f0","sidebarTextActiveColor":"#ffbf69","sidebarTextHoverBg":"#ff9f1c","sidebarUnreadText":"#ff9f1c"};
const LOCK_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
const KEPT_KEY = 'mm-theme-generator-kept';
const PAL_KEY = 'mm-theme-generator-palette';
// Share links store colors in this order. Never reorder or remove entries, or old links will break.
const SHARE_KEYS = ['sidebarBg', 'sidebarText', 'sidebarUnreadText', 'sidebarTextHoverBg', 'sidebarTextActiveBorder',
  'sidebarTextActiveColor', 'sidebarHeaderBg', 'sidebarHeaderTextColor', 'sidebarTeamBarBg', 'centerChannelBg',
  'centerChannelColor', 'linkColor', 'buttonBg', 'buttonColor', 'errorTextColor', 'newMessageSeparator', 'mentionBg',
  'mentionColor', 'mentionHighlightBg', 'mentionHighlightLink', 'onlineIndicator', 'awayIndicator', 'dndIndicator'];
// Inside a Claude artifact the page is framed and cannot see or set the real address bar.
const framed = (() => { try { return window.top !== window.self; } catch (_) { return true; } })();

let cur = null;          // { theme, meta }
let recent = [];         // newest last
let rIdx = -1;
let kept = [];
const locks = new Set();

function hex6(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return '#' + h;
}

// Turn any pasted object into a complete, valid theme. Returns notes about what was fixed.
function normalize(obj, base) {
  const t = {}, notes = [];
  let missing = 0;
  for (const k of COLOR_KEYS) {
    let v = hex6(obj[k]);
    if (!v && k === 'mentionBg') v = hex6(obj.mentionBj);
    if (v) t[k] = v; else { t[k] = base[k]; missing++; }
  }
  t.mentionBj = t.mentionBg;
  if (CODE_THEMES.includes(obj.codeTheme)) t.codeTheme = obj.codeTheme;
  else {
    t.codeTheme = lum(t.centerChannelBg) > 0.4 ? 'github' : 'monokai';
    if (obj.codeTheme !== undefined) notes.push(`codeTheme was ${JSON.stringify(obj.codeTheme)}, which is not one of Mattermost's four code themes. Set to ${t.codeTheme}.`);
  }
  if (missing) notes.push(`${missing} missing or invalid color${missing > 1 ? 's were' : ' was'} filled from the previous theme.`);
  return { t, notes };
}

function themeJSON(t) {
  const out = {};
  for (const k of Object.keys(t).sort()) out[k] = t[k];
  return JSON.stringify(out);
}

function readOpts() {
  return {
    center: $('opt-center').value, sidebar: $('opt-sidebar').value,
    harmony: $('opt-harmony').value, viv: $('opt-viv').value, text: $('opt-text').value,
    hue: $('hue-pin').checked ? Number($('hue').value) : null,
    palette: parsePalette($('pal').value), exact: $('pal-exact').checked,
  };
}

// Pull every hex color out of free text: "#1e325c, ffbc1f", a Coolors link, and so on.
function parsePalette(text) {
  const out = [];
  for (const m of String(text).matchAll(/#([0-9a-f]{3})\b|#?\b([0-9a-f]{6})\b/gi)) {
    const h = hex6('#' + (m[1] || m[2]));
    if (h && !out.includes(h)) out.push(h);
  }
  return out.slice(0, 8);
}

// A share link is "t1-" + 23 colors as hex + one digit for the code theme.
function encodeTheme(t) {
  return 't1-' + SHARE_KEYS.map(k => t[k].slice(1)).join('') + Math.max(0, CODE_THEMES.indexOf(t.codeTheme));
}
function decodeTheme(hash) {
  const m = new RegExp(`^#?t1-([0-9a-f]{${SHARE_KEYS.length * 6}})([0-3])$`, 'i').exec(hash || '');
  if (!m) return null;
  const t = {};
  SHARE_KEYS.forEach((k, i) => { t[k] = '#' + m[1].slice(i * 6, i * 6 + 6).toLowerCase(); });
  t.mentionBj = t.mentionBg;
  t.codeTheme = CODE_THEMES[Number(m[2])];
  return t;
}
// Keep the address bar pointing at the theme on screen, so a reload or a copied address brings it back.
let hashTimer;
function syncHash() {
  if (framed) return;
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    try { history.replaceState(null, '', '#' + encodeTheme(cur.theme)); } catch (_) { /* address stays as it was */ }
  }, 250);
}

function roll(seed) {
  const opts = readOpts();
  const g = generate(seed == null ? (Math.random() * 4294967296) >>> 0 : seed, opts);
  g.palette = opts.palette;
  let meta = g.meta;
  if (cur && locks.size) {
    for (const k of locks) g.theme[k] = cur.theme[k];
    g.theme.mentionBj = g.theme.mentionBg;
    meta += `, ${locks.size} locked`;
  }
  push({ theme: g.theme, meta, palette: g.palette });
}

function push(entry) {
  recent.push(entry);
  if (recent.length > 14) recent.shift();
  rIdx = recent.length - 1;
  cur = entry;
  render();
}

function thumb(t, onClick, isCur) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'thumb' + (isCur ? ' cur' : '');
  b.setAttribute('aria-label', 'Show this theme');
  b.innerHTML = `<i style="background:${t.sidebarTeamBarBg}"></i><i style="background:${t.sidebarBg}"></i>` +
    `<i class="c" style="background:${t.centerChannelBg}"><b style="background:${t.buttonBg}"></b><b style="background:${t.mentionHighlightBg}"></b><b style="background:${t.newMessageSeparator}"></b></i>`;
  b.addEventListener('click', onClick);
  return b;
}

function renderStrips() {
  $('recent').replaceChildren(...recent.map((e, i) => thumb(e.theme, () => { rIdx = i; cur = e; render(); }, i === rIdx)));
  const k = $('kept');
  if (!kept.length) {
    const s = document.createElement('span');
    s.className = 'empty';
    s.textContent = 'Nothing kept yet. Kept themes stay in this browser.';
    k.replaceChildren(s);
    return;
  }
  k.replaceChildren(...kept.map((e, i) => {
    const w = document.createElement('span');
    w.className = 'thumb-wrap';
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'thumb-x'; x.textContent = '×';
    x.setAttribute('aria-label', 'Remove kept theme');
    x.addEventListener('click', () => { kept.splice(i, 1); saveKept(); renderStrips(); });
    w.append(thumb(e.theme, () => push({ theme: { ...e.theme }, meta: e.meta }), false), x);
    return w;
  }));
}

function renderChecks(t) {
  const res = runChecks(t);
  const pass = res.filter(r => r.ok).length;
  $('check-sum').textContent = `${pass} of ${res.length} pass`;
  $('checks').replaceChildren(...res.map(r => {
    const li = document.createElement('li');
    if (!r.ok) li.className = 'bad';
    li.innerHTML = `<span class="chip" style="background:${t[r.bg]};color:${t[r.fg]}">${r.shape ? '<i></i>' : 'Aa'}</span>` +
      `<span class="what">${r.label}</span>` +
      `<span class="num">${r.ratio.toFixed(1)}<small> / ${r.need}</small></span>` +
      `<span class="pill">${r.ok ? 'pass' : 'low'}</span>`;
    return li;
  }));
}

function render() {
  const t = cur.theme, mock = $('mock');
  for (const k of COLOR_KEYS) {
    mock.style.setProperty('--' + k, t[k]);
    $('c-' + k).value = t[k];
    $('h-' + k).textContent = t[k];
    $('s-' + k).classList.toggle('given', (cur.palette || []).includes(t[k]));
  }
  syncHash();
  mock.dataset.code = t.codeTheme;
  $('codeTheme').value = t.codeTheme;
  $('json').value = themeJSON(t);
  $('meta').innerHTML = '';
  const b = document.createElement('b');
  b.textContent = cur.meta;
  $('meta').append(b);
  renderChecks(t);
  renderStrips();
}

function edit(key, value) {
  const theme = { ...cur.theme, [key]: value };
  theme.mentionBj = theme.mentionBg;
  const meta = cur.meta.endsWith('(edited)') ? cur.meta : cur.meta + ' (edited)';
  cur = { theme, meta, palette: cur.palette };
  recent[rIdx] = cur;
  render();
}

function say(text, bad) {
  $('msg').textContent = text;
  $('msg').className = bad ? 'bad' : '';
}

function loadKept() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEPT_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(e => e && e.theme && COLOR_KEYS.every(k => hex6(e.theme[k])))
      .map(e => ({ theme: normalize(e.theme, e.theme).t, meta: String(e.meta || 'Kept theme') }));
  } catch (_) { return []; }
}
function saveKept() {
  try { localStorage.setItem(KEPT_KEY, JSON.stringify(kept)); } catch (_) { /* storage unavailable; kept list lasts for this visit */ }
}

function buildEditor() {
  const root = $('groups');
  for (const [name, slots] of GROUPS) {
    const g = document.createElement('div');
    g.className = 'group';
    const h = document.createElement('h3');
    h.textContent = name;
    g.append(h);
    for (const [key, desc] of slots) {
      const row = document.createElement('div');
      row.className = 'slot';
      row.id = 's-' + key;
      row.innerHTML = `<input type="color" id="c-${key}" aria-label="${key}">` +
        `<div><div class="k">${key}</div><div class="d">${desc}</div></div>` +
        `<span class="hex" id="h-${key}"></span>` +
        `<button type="button" class="lock" id="l-${key}" aria-pressed="false" aria-label="Lock ${key}" title="Keep this color on the next roll">${LOCK_SVG}</button>`;
      g.append(row);
    }
    if (name === 'Status') {
      const row = document.createElement('div');
      row.className = 'slot code';
      row.innerHTML = `<div><div class="k">codeTheme</div><div class="d">Syntax colors in code blocks</div></div>` +
        `<select id="codeTheme" aria-label="codeTheme">${CODE_THEMES.map(c => `<option>${c}</option>`).join('')}</select>`;
      g.append(row);
    }
    root.append(g);
  }
  for (const key of COLOR_KEYS) {
    $('c-' + key).addEventListener('input', e => edit(key, e.target.value));
    $('l-' + key).addEventListener('click', e => {
      const on = !locks.has(key);
      if (on) locks.add(key); else locks.delete(key);
      e.currentTarget.setAttribute('aria-pressed', String(on));
    });
  }
  $('codeTheme').addEventListener('change', e => edit('codeTheme', e.target.value));
}

function loadObject(obj, label) {
  const { t, notes } = normalize(obj, cur.theme);
  push({ theme: t, meta: label });
  const fails = runChecks(t).filter(r => !r.ok).length;
  say([`Loaded. ${fails ? fails + ' contrast checks are low.' : 'All contrast checks pass.'}`, ...notes].join(' '), false);
}

// ---------- wiring ----------
buildEditor();
kept = loadKept();

$('gen').addEventListener('click', () => { say(''); roll(); });
$('keep').addEventListener('click', () => {
  const json = themeJSON(cur.theme);
  if (kept.some(e => themeJSON(e.theme) === json)) return;
  kept.push({ theme: { ...cur.theme }, meta: cur.meta });
  if (kept.length > 24) kept.shift();
  saveKept();
  renderStrips();
});
$('copy').addEventListener('click', () => {
  const ta = $('json');
  ta.value = themeJSON(cur.theme);
  const fallback = () => { ta.focus(); ta.select(); say('Copying was blocked here. The theme is selected, so press Ctrl+C or Cmd+C.', false); };
  try {
    navigator.clipboard.writeText(ta.value).then(() => say('Copied. Paste it into the Custom Theme box in Mattermost.', false), fallback);
  } catch (_) { fallback(); }
});
$('link').addEventListener('click', () => {
  const code = encodeTheme(cur.theme);
  if (framed) {
    try { location.hash = code; } catch (_) { /* nothing else to try */ }
    say('This theme is now part of the page address. Copy the address from your browser, or use Share.', false);
    return;
  }
  try { history.replaceState(null, '', '#' + code); } catch (_) { /* the copied link still works */ }
  const url = location.href.split('#')[0] + '#' + code;
  const fallback = () => say('Copying was blocked here. The link is in the address bar, so copy it from there.', false);
  try {
    navigator.clipboard.writeText(url).then(() => say('Link copied. Anyone who opens it sees this exact theme.', false), fallback);
  } catch (_) { fallback(); }
});
window.addEventListener('hashchange', () => {
  const t = decodeTheme(location.hash);
  if (t && themeJSON(t) !== themeJSON(cur.theme)) push({ theme: t, meta: 'Shared theme' });
});
$('load').addEventListener('click', () => {
  let obj;
  try { obj = JSON.parse($('json').value); } catch (_) { obj = null; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    say('That is not a theme block. Paste the whole thing from Mattermost, from the opening { to the closing }.', true);
    return;
  }
  loadObject(obj, 'Pasted theme');
});
$('sample').addEventListener('click', () => loadObject(ORIGINAL, 'Teal and orange original'));

$('hue-pin').addEventListener('change', e => { $('hue').disabled = !e.target.checked; });
{
  const stops = [];
  for (let h = 0; h <= 360; h += 30) stops.push(toHex(0.72, 0.14, h));
  $('hue').style.background = `linear-gradient(to right, ${stops.join(',')})`;
}

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
  if (e.code === 'Space') { e.preventDefault(); say(''); roll(); }
  else if (e.key === 'ArrowLeft' && rIdx > 0) { rIdx--; cur = recent[rIdx]; render(); }
  else if (e.key === 'ArrowRight' && rIdx < recent.length - 1) { rIdx++; cur = recent[rIdx]; render(); }
});

// ---------- your own colors ----------
let rolledPalette = '';
function savePalette() {
  try { localStorage.setItem(PAL_KEY, JSON.stringify({ text: $('pal').value, exact: $('pal-exact').checked })); } catch (_) { /* not remembered */ }
}
function renderChips() {
  const colors = parsePalette($('pal').value);
  $('pal-clear').hidden = $('pal-note').hidden = !colors.length;
  $('pal-chips').replaceChildren(...colors.map(hex => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip-btn'; b.style.background = hex;
    b.title = `${hex} (click to remove)`;
    b.setAttribute('aria-label', `Remove ${hex}`);
    b.addEventListener('click', () => setPalette(colors.filter(c => c !== hex)));
    return b;
  }));
}
function setPalette(colors) {
  $('pal').value = colors.join(', ');
  commitPalette();
}
// Roll once per change to the color list, however the change was made.
function commitPalette() {
  renderChips();
  savePalette();
  const key = parsePalette($('pal').value).join() + $('pal-exact').checked;
  if (key === rolledPalette) return;
  rolledPalette = key;
  say('');
  roll();
}
$('pal').addEventListener('input', renderChips);
$('pal').addEventListener('change', commitPalette);
$('pal').addEventListener('keydown', e => { if (e.key === 'Enter') commitPalette(); });
$('pal-pick').addEventListener('change', e => setPalette([...parsePalette($('pal').value), e.target.value]));
$('pal-exact').addEventListener('change', () => {
  if (parsePalette($('pal').value).length) commitPalette(); else savePalette();
});
$('pal-clear').addEventListener('click', () => setPalette([]));
try {
  const saved = JSON.parse(localStorage.getItem(PAL_KEY) || 'null');
  if (saved && typeof saved.text === 'string') { $('pal').value = saved.text; $('pal-exact').checked = saved.exact !== false; }
} catch (_) { /* start empty */ }
renderChips();
rolledPalette = parsePalette($('pal').value).join() + $('pal-exact').checked;

// ---------- first view ----------
// A share link opens on its theme. Otherwise open on three fixed rolls so the page is never empty.
const shared = decodeTheme(location.hash);
if (shared) {
  push({ theme: shared, meta: 'Shared theme' });
} else {
  roll(2072);
  roll(1313);
  roll(1357);
  rIdx = 0; cur = recent[0]; render();
}
