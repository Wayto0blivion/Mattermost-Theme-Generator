// Read-only sanity check for the generator: rolls themes across every option combination
// and fails if any theme misses a contrast target or emits a malformed color.
// Run it in a container: see README.md.
const path = require('path');
const fs = require('fs');
const site = path.join(__dirname, '..', 'site');
const { generate, runChecks, CODE_THEMES } = require(path.join(site, 'generator.js'));

// app.js needs a browser, so only confirm it parses.
new Function(fs.readFileSync(path.join(site, 'app.js'), 'utf8'));

const centers = ['any', 'light', 'dark'];
const sidebars = ['any', 'dark', 'color', 'light'];
const harmonies = ['any', 'mono', 'analogous', 'complementary', 'split', 'triadic'];
const vivs = ['any', 'muted', 'balanced', 'vivid'];
const texts = ['any', 'neutral', 'tinted', 'colored'];
const PER_COMBO = 12;

const fails = {};
let total = 0, failing = 0, malformed = 0, seed = 1;
for (const center of centers) for (const sidebar of sidebars) for (const harmony of harmonies)
  for (const viv of vivs) for (const text of texts) for (let i = 0; i < PER_COMBO; i++) {
    const hue = i % 4 === 0 ? (i * 37) % 360 : null;
    const { theme } = generate(seed++, { center, sidebar, harmony, viv, text, hue });
    total++;
    for (const [k, v] of Object.entries(theme)) {
      if (k === 'codeTheme' ? !CODE_THEMES.includes(v) : !/^#[0-9a-f]{6}$/.test(v)) malformed++;
    }
    const low = runChecks(theme).filter(r => !r.ok);
    if (low.length) failing++;
    for (const r of low) {
      const key = `${r.label} [channel=${center} sidebar=${sidebar} text=${text}]`;
      fails[key] = (fails[key] || 0) + 1;
    }
  }

console.log(`themes rolled: ${total}`);
console.log(`themes with a low contrast pair: ${failing}`);
console.log(`malformed values: ${malformed}`);
for (const [k, n] of Object.entries(fails).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${n}  ${k}`);
process.exit(failing || malformed ? 1 : 0);
