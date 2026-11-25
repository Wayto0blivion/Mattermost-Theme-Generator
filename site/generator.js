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

// OKLCH -> hex, pulling chroma in until the color fits sRGB
function toHex(L, C, H) {
  L = clamp(L, 0, 1);
  let rgb = okToLin(L, C, H);
  if (!inGamut(rgb)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(okToLin(L, mid, H))) lo = mid; else hi = mid;
    }
    rgb = okToLin(L, lo, H);
  }
  return '#' + rgb.map(v => {
    v = clamp(v, 0, 1);
    const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(clamp(s, 0, 1) * 255).toString(16).padStart(2, '0');
  }).join('');
}

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(n >> 16 & 255) + 0.7152 * f(n >> 8 & 255) + 0.0722 * f(n & 255);
}
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Degrees between two hues, 0 to 180
const hueGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

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

function generate(seed, opts) {
  const r = mulberry32(seed);
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const range = (a, b) => a + (b - a) * r();

  const rolledHue = r() * 360;
  const H0 = opts.hue == null ? rolledHue : opts.hue;
  const rolledHarmony = pick(['complementary', 'complementary', 'analogous', 'analogous', 'split', 'triadic', 'mono']);
  const harmony = opts.harmony === 'any' ? rolledHarmony : opts.harmony;
  const rolledViv = pick(['muted', 'balanced', 'balanced', 'vivid']);
  const viv = opts.viv === 'any' ? rolledViv : opts.viv;
  const v = { muted: 0.55, balanced: 0.85, vivid: 1.15 }[viv];
  const rolledCenter = r() < 0.6 ? 'light' : 'dark';
  const center = opts.center === 'any' ? rolledCenter : opts.center;
  const light = center === 'light';
  const rolledSidebar = pick(light ? ['dark', 'dark', 'color', 'color', 'light'] : ['dark', 'dark', 'color']);
  const sidebar = opts.sidebar === 'any' ? rolledSidebar : opts.sidebar;
  const side = r() < 0.5 ? 1 : -1;

  // HA drives actions (buttons, links, active marker); HS drives attention (highlight, separator, badge)
  let HA = H0, HS = H0;
  if (harmony === 'analogous') { HA = H0 + 35 * side; HS = H0 - 35 * side; }
  else if (harmony === 'complementary') { HA = H0; HS = H0 + 180; }
  else if (harmony === 'split') { HA = H0 + 150 * side; HS = H0 - 150 * side; }
  else if (harmony === 'triadic') { HA = H0 + 120 * side; HS = H0 - 120 * side; }
  HA = mod360(HA); HS = mod360(HS);

  // ---- how much color the text itself carries. Rolled on its own stream so seeds keep their other colors.
  const r2 = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const rolledText = ['neutral', 'tinted', 'tinted', 'colored', 'colored'][Math.floor(r2() * 5)];
  const text = !opts.text || opts.text === 'any' ? rolledText : opts.text;
  const tAmt = r2();
  const tAlt = r2() < 0.5;

  // ---- center channel
  const cL = light ? range(0.985, 1) : range(0.19, 0.25);
  const cBg = toHex(cL, (light ? range(0, 0.006) : range(0.012, 0.028)) * v, H0);
  const cC = { neutral: light ? 0.022 : 0.014, tinted: 0.035 + 0.02 * tAmt, colored: 0.075 + 0.045 * tAmt }[text];
  const cNeed = text === 'colored' ? 8.5 : 10;
  const cFg = light
    ? fit(text === 'neutral' ? 0.3 : 0.4, cC, H0, h => contrast(h, cBg) >= cNeed, -1)
    : fit(text === 'colored' ? 0.86 : 0.9, cC, H0, h => contrast(h, cBg) >= cNeed, 1);

  // ---- sidebar
  const sbDark = sidebar !== 'light';
  let sL, sC;
  if (sidebar === 'dark') {
    sL = range(0.2, 0.33); sC = range(0.03, 0.085) * v;
    const below = r() < 0.5, gap = range(0.05, 0.08);
    if (!light) sL = below ? cL - gap : cL + gap + 0.01;
  } else if (sidebar === 'color') {
    sL = range(0.42, 0.52); sC = range(0.11, 0.16) * v;
  } else {
    sL = range(0.93, 0.965); sC = range(0.012, 0.035) * v;
  }
  // saturated text is dimmer than white, so the more color the text carries, the deeper the sidebar goes
  const sDeep = { neutral: 6.2, tinted: 8, colored: 9.5 }[text];
  if (sbDark) sL = fitL(sL, sC, H0, h => contrast('#ffffff', h) >= sDeep, -1);
  const step = sidebar === 'dark' ? 0.025 : 0.035;
  const sBg = toHex(sL, sC, H0);
  const sHead = toHex(sL - step, sC * 0.95, H0);
  const sTeam = toHex(sL - step * 2, sC * 0.9, H0);
  const sHover = toHex(sidebar === 'dark' ? sL + 0.055 : sL - 0.045, sC, H0);
  const sTH = text === 'colored' && tAlt ? HS : H0;
  const sVivid = 0.13 * (0.7 + 0.3 * v);
  const sTC = sbDark
    ? { neutral: 0.012, tinted: 0.055, colored: sVivid }[text]
    : { neutral: 0.03, tinted: 0.06, colored: sVivid }[text];
  const sNeed = sbDark ? { neutral: 6, tinted: 5.5, colored: 5.5 }[text] : { neutral: 8, tinted: 8, colored: 6.5 }[text];
  const sStart = sbDark ? { neutral: 0.97, tinted: 0.9, colored: 0.84 }[text] : { neutral: 0.32, tinted: 0.36, colored: 0.46 }[text];
  const sText = fit(sStart, sTC, sTH, h => contrast(h, sBg) >= sNeed && contrast(h, sHover) >= 4.6, sbDark ? 1 : -1);

  // Unread, open-channel and header text each pick their own hue from the harmony, so "bold" rows
  // can differ sharply from normal ones. Each is fitted against every surface it is drawn on.
  const altHue = (avoid, u) => {
    const c = [HS, HA, H0].filter(h => hueGap(h, avoid) >= 25);
    return c.length ? c[Math.floor(u * c.length)] : avoid;
  };
  const sUH = altHue(sTH, r2());
  const sAH = r2() < 0.5 ? sUH : HA;
  const sHH = r2() < 0.5 ? sTH : sUH;
  const strong = (H, main, others) => {
    if (text === 'neutral') return sbDark ? '#ffffff' : toHex(0.17, 0.03, H0);
    const C = text === 'colored' ? sVivid : (sbDark ? 0.04 : 0.055);
    const L0 = sbDark ? (text === 'colored' ? 0.88 : 0.95) : (text === 'colored' ? 0.38 : 0.24);
    const need = sbDark ? 6 : 7;
    return fit(L0, C, H, h => contrast(h, main) >= need && others.every(s => contrast(h, s) >= 4.6), sbDark ? 1 : -1);
  };
  const sUnread = strong(sUH, sBg, [sHover]);
  const sActive = strong(sAH, sBg, [mixHex(sText, sBg, 0.16)]);
  const sHeadText = strong(sHH, sHead, [sTeam]);
  const sBorder = fit(sbDark ? 0.76 : 0.52, 0.16 * v, HA, h => contrast(h, sBg) >= 3, sbDark ? 1 : -1);

  // ---- mention badge in the sidebar
  let mBg, mFg;
  const whiteBadge = r() < 0.35;
  if (sbDark && (harmony === 'mono' || whiteBadge)) {
    mBg = '#ffffff';
    mFg = fit(Math.min(sL, 0.3), sC, H0, h => contrast(h, mBg) >= 5.5, -1);
  } else if (sbDark) {
    mBg = fit(0.82, 0.15 * v, HS, h => contrast(h, sBg) >= 4.5, 1);
    mFg = fit(0.22, 0.05, HS, h => contrast(h, mBg) >= 5.5, -1);
  } else {
    mBg = fit(0.52, 0.18 * v, HA, h => contrast(h, sBg) >= 4.5 && contrast('#ffffff', h) >= 4.5, -1);
    mFg = '#ffffff';
  }

  // ---- actions
  const darkInk = toHex(0.16, 0.02, HA);
  const bStart = light ? 0.54 : range(0.56, 0.7);
  const bBg = fit(bStart, 0.17 * v, HA,
    h => contrast(h, cBg) >= 3 && Math.max(contrast('#ffffff', h), contrast(darkInk, h)) >= 4.6, light ? -1 : 0);
  const bFg = contrast('#ffffff', bBg) >= 4.5 ? '#ffffff' : darkInk;
  const link = fit(light ? 0.5 : 0.76, 0.16 * v, HA, h => contrast(h, cBg) >= 4.6, light ? -1 : 1);
  const err = fit(light ? 0.56 : 0.72, 0.2, 27, h => contrast(h, cBg) >= 4.6, light ? -1 : 1);

  // ---- attention
  const sep = fit(light ? 0.66 : 0.74, 0.16 * v, HS, h => contrast(h, cBg) >= 3.1, light ? -1 : 1);
  const hBg = fit(light ? 0.91 : 0.4, 0.09 * v, HS, h => contrast(h, cBg) >= 1.22, light ? -1 : 1);
  const hLink = fit(light ? 0.3 : 0.95, light ? 0.09 : 0.04, HS, h => contrast(h, hBg) >= 5.5, light ? -1 : 1);

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
  const meta = `${HARMONY_LABEL[harmony]} on ${hueName(H0)} (${Math.round(H0)}°), ${viv}, ${SIDEBAR_LABEL[sidebar]} sidebar, ${center} channel, ${text} text`;
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

if (typeof module !== 'undefined') module.exports = { generate, runChecks, contrast, toHex, CHECKS, CODE_THEMES };
