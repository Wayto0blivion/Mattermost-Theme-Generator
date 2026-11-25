// Theme generation and contrast checks. No DOM access in this file, so tools/check.js can load it in Node.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mod360 = h => ((h % 360) + 360) % 360;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// OKLCH -> linear sRGB
function okToLin(L, C, H) {
  const h = H * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
const inGamut = c => c.every(v => v > -1e-4 && v < 1 + 1e-4);

// The chroma a color really gets once it is pulled inside sRGB
function gamutC(L, C, H) {
  if (inGamut(okToLin(L, C, H))) return C;
  let lo = 0, hi = C;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(okToLin(L, mid, H))) lo = mid; else hi = mid;
  }
  return lo;
}

// OKLCH -> hex
function toHex(L, C, H) {
  L = clamp(L, 0, 1);
  const rgb = okToLin(L, gamutC(L, C, H), H);
  return '#' + rgb.map(v => {
    v = clamp(v, 0, 1);
    const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(clamp(s, 0, 1) * 255).toString(16).padStart(2, '0');
  }).join('');
}

const srgbToLin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };

// hex -> OKLCH
function hexToOk(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = srgbToLin(n >> 16 & 255), g = srgbToLin(n >> 8 & 255), b = srgbToLin(n & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L, C: Math.hypot(A, B), H: mod360(Math.atan2(B, A) * 180 / Math.PI) };
}

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * srgbToLin(n >> 16 & 255) + 0.7152 * srgbToLin(n >> 8 & 255) + 0.0722 * srgbToLin(n & 255);
}
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Degrees between two hues, 0 to 180
const hueGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
// Drop hues that sit within 15 degrees of one already kept
const uniqHues = hs => hs.map(mod360).filter((h, i, a) => a.slice(0, i).every(p => hueGap(p, h) >= 15));

// OKLab coordinates and distance, used to judge how different two colors look
const labOf = (L, C, H) => { const c = gamutC(L, C, H), h = H * Math.PI / 180; return [L, c * Math.cos(h), c * Math.sin(h)]; };
const labDist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

// sRGB blend, the same result as CSS color-mix(in srgb, a t, b)
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  return '#' + [16, 8, 0].map(s => Math.round((pa >> s & 255) * t + (pb >> s & 255) * (1 - t)).toString(16).padStart(2, '0')).join('');
}

// Walk lightness away from a starting point until test(hex) passes.
// dir: -1 darker, +1 lighter, 0 whichever is nearer.
function scan(L, C, H, test, dir, lo = 0.03, hi = 0.995) {
  for (let i = 0; i <= 200; i++) {
    const d = i * 0.005;
    const cands = dir < 0 ? [L - d] : dir > 0 ? [L + d] : (i === 0 ? [L] : [L - d, L + d]);
    for (const l of cands) {
      if (l < lo || l > hi) continue;
      if (test(toHex(l, C, H))) return l;
    }
  }
  return null;
}
function fitL(L, C, H, test, dir) {
  let r = scan(L, C, H, test, dir);
  if (r === null && dir !== 0) r = scan(L, C, H, test, 0);
  return r === null ? clamp(L, 0.03, 0.995) : r;
}
const fit = (L, C, H, test, dir) => toHex(fitL(L, C, H, test, dir), C, H);

// Text has to end up legible whatever surface it lands on. Try each contrast target in turn against the
// main surface (other surfaces need 4.6), and if no lightness works, fall back to black or white.
function fitText(L, C, H, main, others, needs, dir) {
  for (const need of needs) {
    const test = h => contrast(h, main) >= need && others.every(s => contrast(h, s) >= Math.min(need, 4.6));
    let l = scan(L, C, H, test, dir);
    if (l === null) l = scan(L, C, H, test, 0);
    if (l !== null) return { hex: toHex(l, C, H), L: l, lab: labOf(l, C, H) };
  }
  // No lightness of this color works. Plain white or black may still clear every surface.
  const worst = h => Math.min(contrast(h, main), ...others.map(s => contrast(h, s)));
  const bw = worst('#ffffff') >= worst('#000000') ? '#ffffff' : '#000000';
  if (worst(bw) >= 4.5) return { hex: bw, L: bw === '#ffffff' ? 1 : 0, lab: [bw === '#ffffff' ? 1 : 0, 0, 0] };
  // Otherwise the surfaces cannot all be satisfied, and the main one wins.
  const onMain = h => contrast(h, main) >= 4.6;
  let l = scan(L, C, H, onMain, dir);
  if (l === null) l = scan(L, C, H, onMain, 0);
  if (l !== null) return { hex: toHex(l, C, H), L: l, lab: labOf(l, C, H) };
  return contrast('#ffffff', main) >= contrast('#000000', main) ? { hex: '#ffffff', L: 1, lab: [1, 0, 0] } : { hex: '#000000', L: 0, lab: [0, 0, 0] };
}

const HUE_NAMES = [[15, 'rose'], [40, 'red'], [70, 'orange'], [105, 'yellow'], [135, 'lime'], [165, 'green'], [200, 'teal'], [235, 'sky'], [270, 'blue'], [295, 'violet'], [325, 'purple'], [350, 'magenta'], [361, 'rose']];
const hueName = h => HUE_NAMES.find(x => h < x[0])[1];
const HARMONY_LABEL = { mono: 'Single hue', analogous: 'Analogous', complementary: 'Complementary', split: 'Split complementary', triadic: 'Triadic' };
const SIDEBAR_LABEL = { dark: 'deep', color: 'colored', light: 'pale' };
const CODE_THEMES = ['github', 'monokai', 'solarized-dark', 'solarized-light'];

function statusL(H, C, ideal, sBg, cBg) {
  for (const [a, b] of [[3, 1.7], [3, 1.35], [2.3, 1.2], [1.6, 1.1]]) {
    const l = scan(ideal, C, H, h => contrast(h, sBg) >= a && contrast(h, cBg) >= b, 0, 0.4, 0.93);
    if (l !== null) return l;
  }
  return ideal;
}

// opts: { center, sidebar, harmony, viv, text, hue, palette, exact }
// palette is a list of hex colors to build the theme from (one works as a seed). exact keeps them unchanged.
function generate(seed, opts) {
  const r = mulberry32(seed);
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const range = (a, b) => a + (b - a) * r();
  const whiteOn = h => contrast('#ffffff', h);

  // ---- the caller's own colors, if any
  const P = (opts.palette || []).slice(0, 8).map(hex => ({ hex, ...hexToOk(hex), used: 0 }));
  const hasP = P.length > 0;
  const exact = opts.exact !== false;
  const r3 = mulberry32((seed ^ 0x51ed270b) >>> 0);
  const shuffle = arr => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r3() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  // First candidate that passes, preferring colors not placed anywhere yet
  const take = (cands, test) => {
    for (const c of [...cands].sort((a, b) => a.used - b.used)) if (test(c.hex)) { c.used++; return c; }
    return null;
  };

  const rolledHue = r() * 360;
  const rolledHarmony = pick(['complementary', 'complementary', 'analogous', 'analogous', 'split', 'triadic', 'mono']);
  const harmony = opts.harmony === 'any' ? rolledHarmony : opts.harmony;
  const rolledViv = pick(['muted', 'balanced', 'balanced', 'vivid']);
  const viv = opts.viv === 'any' ? rolledViv : opts.viv;
  const v = { muted: 0.55, balanced: 0.85, vivid: 1.15 }[viv];
  const rolledCenter = r() < 0.6 ? 'light' : 'dark';
  let center = opts.center === 'any' ? rolledCenter : opts.center;
  if (hasP && opts.center === 'any' && P.some(c => c.L >= 0.93) && !P.some(c => c.L <= 0.3)) center = 'light';
  const light = center === 'light';
  const rolledSidebar = pick(light ? ['dark', 'dark', 'color', 'color', 'light'] : ['dark', 'dark', 'color']);
  const side = r() < 0.5 ? 1 : -1;

  // ---- how much color the text itself carries. Rolled on its own stream so seeds keep their other colors.
  const r2 = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const rolledText = ['neutral', 'tinted', 'tinted', 'colored', 'colored'][Math.floor(r2() * 5)];
  const text = !opts.text || opts.text === 'any' ? rolledText : opts.text;
  const tAmt = r2();
  const tAlt = r2() < 0.5;
  const uUnread = r2(), uActive = r2(), uHead = r2();

  // ---- center channel lightness and tint, used when the palette does not supply the channel background
  const rolledCL = light ? range(0.985, 1) : range(0.19, 0.25);
  const rolledCC = (light ? range(0, 0.006) : range(0.012, 0.028)) * v;

  // ---- deal palette colors onto the two big surfaces
  // channel: a near-white (light) or near-black (dark) color, if the palette has one
  const cBgP = !hasP ? null : light
    ? take(P.filter(c => c.L >= 0.93).sort((a, b) => b.L - a.L), () => true)
    : take(P.filter(c => c.L <= 0.3).sort((a, b) => a.L - b.L), () => true);
  // sidebar: a color dark enough for light text, or light enough for dark text
  let sidebar = opts.sidebar === 'any' ? rolledSidebar : opts.sidebar;
  let sideP = null;
  if (hasP) {
    const free = P.filter(c => !c.used);
    const darkC = free.filter(c => whiteOn(c.hex) >= 4.6);
    const paleC = free.filter(c => c.L >= 0.88);
    if (opts.sidebar === 'any') {
      if (sidebar !== 'light' && !darkC.length && paleC.length) sidebar = 'light';
      else if (sidebar === 'light' && !paleC.length && darkC.length) sidebar = 'dark';
    }
    if (sidebar === 'light') sideP = take(shuffle(paleC), () => true);
    else {
      const order = opts.sidebar === 'color' ? [...darkC].sort((a, b) => b.C - a.C)
        : opts.sidebar === 'dark' ? [...darkC].sort((a, b) => a.L - b.L) : shuffle(darkC);
      sideP = take(order, () => true);
      if (sideP && opts.sidebar === 'any') sidebar = sideP.C >= 0.09 && sideP.L >= 0.36 ? 'color' : 'dark';
    }
  }

  // ---- split the remaining colored inputs into two roles
  // action: buttons, links, active marker. attention: mention highlight, New Messages line, badge.
  // Colors that can carry a button on this channel go first, so they land in the action role.
  const cRef = cBgP ? cBgP.hex : toHex(rolledCL, 0, 0);
  const asButton = c => contrast(c.hex, cRef) >= 3;
  const accents = shuffle(P.filter(c => !c.used && c.C >= 0.05)).sort((a, b) => asButton(b) - asButton(a));
  let actionC, attnC;
  if (accents.length === 1) {
    const act = asButton(accents[0]) && r3() < 0.6;
    actionC = act ? accents : []; attnC = act ? [] : accents;
  } else {
    actionC = accents.filter((_, i) => i % 2 === 0); attnC = accents.filter((_, i) => i % 2 === 1);
  }
  // with fewer than two accents, the harmony supplies the hue for whichever role is left empty
  const invent = accents.length < 2;

  // ---- hues. H0 is the base (sidebar, channel tint), HA the action hue, HS the attention hue.
  const fromBase = h => harmony === 'analogous' ? [h + 35 * side, h - 35 * side]
    : harmony === 'complementary' ? [h, h + 180]
    : harmony === 'split' ? [h + 150 * side, h - 150 * side]
    : harmony === 'triadic' ? [h + 120 * side, h - 120 * side] : [h, h];
  const baseFromAction = h => harmony === 'analogous' ? h - 35 * side
    : harmony === 'split' ? h - 150 * side : harmony === 'triadic' ? h - 120 * side : h;
  const baseFromAttention = h => harmony === 'analogous' ? h + 35 * side : harmony === 'complementary' ? h + 180
    : harmony === 'split' ? h + 150 * side : harmony === 'triadic' ? h + 120 * side : h;
  const sideHue = sideP && sideP.C >= 0.03 ? sideP.H : null;
  const chanHue = cBgP && cBgP.C >= 0.03 ? cBgP.H : null;
  let H0, HA, HS;
  if (sideHue == null && chanHue == null && !accents.length) {
    H0 = opts.hue == null ? rolledHue : opts.hue;
    [HA, HS] = fromBase(H0);
  } else {
    H0 = sideHue != null ? sideHue
      : accents.length >= 2 ? accents[Math.floor(r3() * accents.length)].H
      : accents.length ? (actionC.length ? baseFromAction(accents[0].H) : baseFromAttention(accents[0].H))
      : chanHue;
    const [fa, fs] = fromBase(H0);
    HA = actionC[0] ? actionC[0].H : fa;
    HS = attnC[0] ? attnC[0].H : fs;
  }
  H0 = mod360(H0); HA = mod360(HA); HS = mod360(HS);

  // An accent slot takes a palette color unchanged when one passes the slot's test. If none passes:
  //   exact colors:  the slot is derived from the role's hue instead, unless it is the role's main slot
  //                  (force), which keeps the palette color so that it still appears in the theme.
  //   nudged colors: the closest palette color has its lightness moved until it passes.
  const accent = (cands, test, score, force) => {
    if (!cands.length) return null;
    const hit = take(cands, test);
    if (hit) return hit.hex;
    const top = Math.max(...cands.map(c => score(c.hex)));
    const best = cands.filter(c => score(c.hex) >= top * 0.8).sort((a, b) => a.used - b.used || score(b.hex) - score(a.hex))[0];
    if (exact) { if (!force) return null; best.used++; return best.hex; }
    const l = scan(best.L, best.C, best.H, test, 0);
    if (l === null) return null;
    best.used++;
    return toHex(l, best.C, best.H);
  };

  // ---- center channel background
  const cL = cBgP ? cBgP.L : rolledCL;
  const cBg = cBgP ? cBgP.hex : toHex(rolledCL, rolledCC, H0);

  // ---- sidebar background
  let sL, sC, sH = H0;
  if (sidebar === 'dark') {
    sL = range(0.2, 0.33); sC = range(0.03, 0.085) * v;
    const below = r() < 0.5, gap = range(0.05, 0.08);
    if (!light) sL = below ? cL - gap : cL + gap + 0.01;
  } else if (sidebar === 'color') {
    sL = range(0.42, 0.52); sC = range(0.11, 0.16) * v;
  } else {
    sL = range(0.93, 0.965); sC = range(0.012, 0.035) * v;
  }
  if (sideP) { sL = sideP.L; sC = sideP.C; sH = sideP.H; }
  const sbDark = sidebar !== 'light';
  // saturated text is dimmer than white, so the more color the text carries, the deeper the sidebar goes
  const sDeep = { neutral: 6.2, tinted: 8, colored: 9.5 }[text];
  if (sbDark && !(sideP && exact)) sL = fitL(sL, sC, sH, h => whiteOn(h) >= sDeep, -1);
  const sBg = sideP && sL === sideP.L ? sideP.hex : toHex(sL, sC, sH);
  const step = sidebar === 'dark' ? 0.025 : 0.035;
  // hover normally lightens a deep sidebar; when the sidebar has little contrast to spare it darkens instead
  const tight = sideP && sbDark && whiteOn(sBg) < 8;
  const sHover = toHex(sidebar === 'dark' && !tight ? sL + 0.055 : sL - 0.045, sC, sH);

  // ---- accent slots
  const sBorder = accent(actionC, h => contrast(h, sBg) >= 3, h => contrast(h, sBg), false)
    || fit(sbDark ? 0.76 : 0.52, 0.16 * v, HA, h => contrast(h, sBg) >= 3, sbDark ? 1 : -1);

  let mBg, mFg;
  const whiteBadge = r() < 0.35;
  const mBgP = accent(attnC, h => contrast(h, sBg) >= 3, h => contrast(h, sBg), false);
  if (mBgP) {
    mBg = mBgP;
    const dk = lum(mBg) < 0.179;
    mFg = fitText(dk ? 0.97 : 0.22, dk ? 0.02 : 0.05, hexToOk(mBg).H, mBg, [], [5.5, 4.6], dk ? 1 : -1).hex;
  } else if (sbDark && (harmony === 'mono' || whiteBadge)) {
    mBg = '#ffffff';
    mFg = fit(Math.min(sL, 0.3), sC, sH, h => contrast(h, mBg) >= 5.5, -1);
  } else if (sbDark) {
    mBg = fit(0.82, 0.15 * v, HS, h => contrast(h, sBg) >= 4.5, 1);
    mFg = fit(0.22, 0.05, HS, h => contrast(h, mBg) >= 5.5, -1);
  } else {
    mBg = fit(0.52, 0.18 * v, HA, h => contrast(h, sBg) >= 4.5 && whiteOn(h) >= 4.5, -1);
    mFg = '#ffffff';
  }

  const darkInk = toHex(0.16, 0.02, HA);
  const bStart = light ? 0.54 : range(0.56, 0.7);
  const bBg = accent(actionC, h => contrast(h, cBg) >= 3, h => contrast(h, cBg), true)
    || fit(bStart, 0.17 * v, HA, h => contrast(h, cBg) >= 3 && Math.max(whiteOn(h), contrast(darkInk, h)) >= 4.6, light ? -1 : 0);
  const bFg = ['#ffffff', darkInk, '#000000'].find(t => contrast(t, bBg) >= 4.5)
    || (whiteOn(bBg) >= contrast('#000000', bBg) ? '#ffffff' : '#000000');
  const linkP = take(actionC, h => contrast(h, cBg) >= 4.6);
  const link = linkP ? linkP.hex : fitText(light ? 0.5 : 0.76, 0.16 * v, HA, cBg, [], [4.6], light ? -1 : 1).hex;
  const err = fitText(light ? 0.56 : 0.72, 0.2, 27, cBg, [], [4.6], light ? -1 : 1).hex;

  const hBgP = accent(attnC, h => contrast(h, cBg) >= 1.22, h => contrast(h, cBg), true);
  const hBg = hBgP || fit(light ? 0.91 : 0.4, 0.09 * v, HS, h => contrast(h, cBg) >= 1.22, light ? -1 : 1);
  const hDk = lum(hBg) < 0.179;
  const hLink = fitText(hDk ? 0.95 : 0.3, hDk ? 0.04 : 0.09, hBgP ? hexToOk(hBg).H : HS, hBg, [], [5.5, 4.6], hDk ? 1 : -1).hex;
  const sep = accent(attnC, h => contrast(h, cBg) >= 3.1, h => contrast(h, cBg), false)
    || fit(light ? 0.66 : 0.74, 0.16 * v, HS, h => contrast(h, cBg) >= 3.1, light ? -1 : 1);

  // ---- top bar and sidebar header. Palette colors that found no other job land here, so they still show.
  const left = shuffle(P.filter(c => !c.used));
  const barP = left.length ? take(left, () => true) : null;
  const barDk = barP ? lum(barP.hex) < 0.179 : sbDark;
  const headP = barP ? take(left, h => (lum(h) < 0.179) === barDk && contrast(h, barP.hex) < 3) : null;
  const sTeam = barP ? barP.hex : toHex(sL - step * 2, sC * 0.9, sH);
  // the derived header moves away from its text color, so one text color works on both bars
  const sHead = headP ? headP.hex
    : barP ? toHex(clamp(barP.L + (barDk ? -0.03 : 0.03), 0, 0.99), barP.C, barP.H)
    : toHex(sL - step, sC * 0.95, sH);

  // ---- message text
  const cC = { neutral: light ? 0.022 : 0.014, tinted: 0.035 + 0.02 * tAmt, colored: 0.075 + 0.045 * tAmt }[text];
  const cNeed = text === 'colored' ? 8.5 : 10;
  const cFgP = hasP && text !== 'neutral' ? take(P, h => contrast(h, cBg) >= cNeed) : null;
  const cFg = cFgP ? cFgP.hex : light
    ? fitText(text === 'neutral' ? 0.3 : 0.4, cC, H0, cBg, [], [cNeed, 7.2], -1).hex
    : fitText(text === 'colored' ? 0.86 : 0.9, cC, H0, cBg, [], [cNeed, 7.2], 1).hex;

  // ---- sidebar text
  const sTH = text === 'colored' && tAlt ? HS : H0;
  const sVivid = 0.13 * (0.7 + 0.3 * v);
  const sTC = sbDark
    ? { neutral: 0.012, tinted: 0.055, colored: sVivid }[text]
    : { neutral: 0.03, tinted: 0.06, colored: sVivid }[text];
  const sNeed = sbDark ? { neutral: 6, tinted: 5.5, colored: 5.5 }[text] : { neutral: 8, tinted: 8, colored: 6.5 }[text];
  const sStart = sbDark ? { neutral: 0.97, tinted: 0.9, colored: 0.84 }[text] : { neutral: 0.32, tinted: 0.36, colored: 0.46 }[text];
  const sTextP = hasP && text !== 'neutral' ? take(P, h => contrast(h, sBg) >= 5 && contrast(h, sHover) >= 4.6) : null;
  const sTextF = sTextP ? null : fitText(sStart, sTC, sTH, sBg, [sHover], [sNeed, 4.6], sbDark ? 1 : -1);
  const sText = sTextP ? sTextP.hex : sTextF.hex;
  const sTextLab = sTextP ? labOf(sTextP.L, sTextP.C, sTextP.H) : sTextF.lab;
  const sTextHue = sTextP ? sTextP.H : sTH;

  // Unread, open-channel and header text ("strong" text) should look clearly different from normal sidebar
  // text. Each candidate hue is fitted for contrast, then scored by how far it lands from the normal text
  // color and from plain white or black. If the harmony's own hues all come out washed out at the lightness
  // contrast demands, the search widens to the rest of the color wheel. A single-hue theme has no other hue
  // to use, so there strong text is a lighter or darker step of the same color.
  const pool = uniqHues([HS, HA, H0]);
  const wheel = uniqHues([...pool, H0 + 180, H0 + 120, H0 - 120, H0 + 90, H0 - 90, H0 + 60, H0 - 60]).slice(pool.length);
  const strong = (main, others, u) => {
    const dk = lum(main) < 0.179;
    if (text === 'neutral') return dk ? '#ffffff' : fitText(0.17, 0.03, H0, main, others, [7, 4.6], -1).hex;
    const C = text === 'colored' ? sVivid : (dk ? 0.04 : 0.055);
    const L0 = dk ? (text === 'colored' ? 0.84 : 0.95) : (text === 'colored' ? 0.42 : 0.24);
    const need = dk ? 5 : 6;
    const score = lab => Math.min(labDist(lab, sTextLab), 1.6 * Math.hypot(lab[1], lab[2]));
    const build = H => { const f = fitText(L0, C, H, main, others, [need, 4.6], dk ? 1 : -1); return { hex: f.hex, score: score(f.lab) }; };
    let c = P.filter(p => contrast(p.hex, main) >= need && others.every(s => contrast(p.hex, s) >= 4.6))
      .map(p => ({ hex: p.hex, p, score: score(labOf(p.L, p.C, p.H)) + (p.used ? 0 : 0.05) }));
    c = c.concat(pool.map(build));
    const top = () => Math.max(...c.map(x => x.score));
    if (text === 'colored' && invent && harmony !== 'mono' && top() < 0.13) c = c.concat(wheel.map(build));
    const best = top();
    if (best < 0.06) return fitText(dk ? 0.96 : 0.2, dk ? 0.045 : 0.07, sTextHue, main, others, [need, 4.6], dk ? 1 : -1).hex;
    const good = c.filter(x => x.score >= best * 0.8);
    const g = good[Math.min(good.length - 1, Math.floor(u * good.length))];
    if (g.p) g.p.used++;
    return g.hex;
  };
  const sUnread = strong(sBg, [sHover], uUnread);
  const sActive = strong(sBg, [mixHex(sText, sBg, 0.16)], uActive);
  const sHeadText = strong(sHead, [sTeam], uHead);

  // ---- status dots keep their meaning; only lightness moves to stay visible on both surfaces
  const onL = statusL(150, 0.17, 0.74, sBg, cBg);
  let awayH = 88, awayL = statusL(awayH, 0.16, 0.84, sBg, cBg);
  if (awayL < 0.7) { awayH = 62; awayL = statusL(awayH, 0.16, 0.74, sBg, cBg); }
  const dndL = statusL(25, 0.19, 0.6, sBg, cBg);

  const theme = {
    sidebarBg: sBg, sidebarText: sText, sidebarUnreadText: sUnread, sidebarTextHoverBg: sHover,
    sidebarTextActiveBorder: sBorder, sidebarTextActiveColor: sActive,
    sidebarHeaderBg: sHead, sidebarHeaderTextColor: sHeadText, sidebarTeamBarBg: sTeam,
    onlineIndicator: toHex(onL, 0.17, 150), awayIndicator: toHex(awayL, 0.16, awayH), dndIndicator: toHex(dndL, 0.19, 25),
    mentionBg: mBg, mentionBj: mBg, mentionColor: mFg,
    centerChannelBg: cBg, centerChannelColor: cFg, newMessageSeparator: sep,
    linkColor: link, buttonBg: bBg, buttonColor: bFg, errorTextColor: err,
    mentionHighlightBg: hBg, mentionHighlightLink: hLink,
    codeTheme: light ? pick(['github', 'github', 'solarized-light']) : pick(['monokai', 'solarized-dark']),
  };

  const tail = `${SIDEBAR_LABEL[sidebar]} sidebar, ${center} channel, ${text} text`;
  let meta;
  if (hasP) {
    const values = new Set(Object.values(theme));
    const kept = P.filter(c => values.has(c.hex)).length;
    const from = P.length === 1 ? P[0].hex : `your ${P.length} colors`;
    const how = P.length === 1 ? (kept ? 'placed unchanged' : 'adjusted to fit')
      : `${kept === P.length ? 'all' : kept + ' of ' + P.length} placed unchanged`;
    meta = `From ${from} (${how})${invent ? ', ' + HARMONY_LABEL[harmony].toLowerCase() : ''}, ${tail}`;
  } else {
    meta = `${HARMONY_LABEL[harmony]} on ${hueName(H0)} (${Math.round(H0)}°), ${viv}, ${tail}`;
  }
  return { theme, meta };
}

// [foreground key, background key, minimum ratio, label, isShape]
const CHECKS = [
  ['centerChannelColor', 'centerChannelBg', 7, 'Message text on channel'],
  ['linkColor', 'centerChannelBg', 4.5, 'Links on channel'],
  ['errorTextColor', 'centerChannelBg', 4.5, 'Error text on channel'],
  ['buttonColor', 'buttonBg', 4.5, 'Button label on button'],
  ['buttonBg', 'centerChannelBg', 3, 'Button against channel', 1],
  ['newMessageSeparator', 'centerChannelBg', 3, 'New Messages line on channel', 1],
  ['mentionHighlightLink', 'mentionHighlightBg', 4.5, 'Mention text on its highlight'],
  ['sidebarText', 'sidebarBg', 4.5, 'Read channels in sidebar'],
  ['sidebarUnreadText', 'sidebarBg', 4.5, 'Unread channels in sidebar'],
  ['sidebarTextActiveColor', 'sidebarBg', 4.5, 'Active channel in sidebar'],
  ['sidebarText', 'sidebarTextHoverBg', 4.5, 'Sidebar text on hover'],
  ['sidebarTextActiveBorder', 'sidebarBg', 3, 'Active marker on sidebar', 1],
  ['sidebarHeaderTextColor', 'sidebarHeaderBg', 4.5, 'Team name on sidebar header'],
  ['sidebarHeaderTextColor', 'sidebarTeamBarBg', 4.5, 'Top bar text'],
  ['mentionColor', 'mentionBg', 4.5, 'Count on mention badge'],
  ['mentionBg', 'sidebarBg', 3, 'Mention badge on sidebar', 1],
  ['onlineIndicator', 'sidebarBg', 3, 'Online dot on sidebar', 1],
  ['awayIndicator', 'sidebarBg', 3, 'Away dot on sidebar', 1],
  ['dndIndicator', 'sidebarBg', 3, 'Do Not Disturb dot on sidebar', 1],
];
function runChecks(t) {
  return CHECKS.map(([fg, bg, need, label, shape]) => {
    const ratio = contrast(t[fg], t[bg]);
    return { fg, bg, need, label, shape: !!shape, ratio, ok: ratio >= need };
  });
}

if (typeof module !== 'undefined') module.exports = { generate, runChecks, contrast, toHex, hexToOk, CHECKS, CODE_THEMES };
