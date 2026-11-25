// Read-only sanity check for the generator. Exits non-zero if a rule below is broken.
//   Random themes:          every contrast check passes.
//   Palette, nudged colors: every contrast check passes.
//   Palette, exact colors:  every text check passes (shape checks such as "button against channel"
//                           may be low, because the caller asked for their colors untouched).
// Run it in a container: see README.md.
const path = require('path');
const fs = require('fs');
const site = path.join(__dirname, '..', 'site');
const { generate, runChecks, toHex, CODE_THEMES } = require(path.join(site, 'generator.js'));

// app.js needs a browser, so only confirm it parses.
new Function(fs.readFileSync(path.join(site, 'app.js'), 'utf8'));

const centers = ['any', 'light', 'dark'];
const sidebars = ['any', 'dark', 'color', 'light'];
const harmonies = ['any', 'mono', 'analogous', 'complementary', 'split', 'triadic'];
const vivs = ['any', 'muted', 'balanced', 'vivid'];
const texts = ['any', 'neutral', 'tinted', 'colored'];

let seed = 1, problems = 0;
function tally(name, themes, mustPass) {
  const fails = {};
  let failing = 0, malformed = 0;
  for (const { theme, tag } of themes) {
    for (const [k, v] of Object.entries(theme)) {
      if (k === 'codeTheme' ? !CODE_THEMES.includes(v) : !/^#[0-9a-f]{6}$/.test(v)) malformed++;
    }
    const low = runChecks(theme).filter(r => !r.ok && mustPass(r));
    if (low.length) failing++;
    for (const r of low) { const key = `${r.label} [${tag}]`; fails[key] = (fails[key] || 0) + 1; }
  }
  console.log(`${name}: ${themes.length} themes, ${failing} breaking the rule, ${malformed} malformed values`);
  for (const [k, n] of Object.entries(fails).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`    ${n}  ${k}`);
  problems += failing + malformed;
}

// ---- random themes
const random = [];
for (const center of centers) for (const sidebar of sidebars) for (const harmony of harmonies)
  for (const viv of vivs) for (const text of texts) for (let i = 0; i < 12; i++) {
    const hue = i % 4 === 0 ? (i * 37) % 360 : null;
    random.push({ theme: generate(seed++, { center, sidebar, harmony, viv, text, hue }).theme, tag: `channel=${center} sidebar=${sidebar} text=${text}` });
  }
tally('random', random, () => true);

// ---- palettes of 1 to 6 arbitrary colors, plus a few real-world shapes
let s = 12345;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const anyColor = () => toHex(0.08 + rnd() * 0.9, rnd() * 0.22, rnd() * 360);
const fixed = [
  ['#ff9f1c', '#ffbf69', '#ffffff', '#cbf3f0', '#2ec4b6'],
  ['#1e325c', '#ffffff', '#ffbc1f'],
  ['#000000'], ['#ffffff'], ['#808080'], ['#2ec4b6'], ['#ff0000', '#00ff00', '#0000ff'],
  ['#777777', '#888888', '#999999'], ['#111111', '#222222'], ['#fefefe', '#f0f0f0'],
];
for (const exact of [true, false]) {
  const out = [];
  for (let i = 0; i < 6000; i++) {
    const palette = i < fixed.length * 20 ? fixed[i % fixed.length] : Array.from({ length: 1 + Math.floor(rnd() * 6) }, anyColor);
    const opts = {
      center: centers[i % 3], sidebar: sidebars[Math.floor(i / 3) % 4], harmony: harmonies[Math.floor(i / 12) % 6],
      viv: 'any', text: texts[Math.floor(i / 5) % 4], hue: null, palette, exact,
    };
    out.push({ theme: generate(seed++, opts).theme, tag: `n=${palette.length} channel=${opts.center} sidebar=${opts.sidebar} text=${opts.text}` });
  }
  tally(exact ? 'palette, exact' : 'palette, nudged', out, exact ? r => !r.shape : () => true);
}

process.exit(problems ? 1 : 0);
