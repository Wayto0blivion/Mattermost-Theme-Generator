// Folds site/ into one self-contained file for publishing as a Claude artifact.
// Artifacts supply their own <html>/<head>/<body>, so this emits page content only,
// with the stylesheet and both scripts inlined. Output: dist/artifact.html
const fs = require('fs');
const path = require('path');
const site = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(site, f), 'utf8');

const index = read('index.html');
const pickTag = re => { const m = index.match(re); if (!m) throw new Error(`index.html is missing ${re}`); return m[0]; };
const start = index.indexOf('<!-- app:start -->'), end = index.indexOf('<!-- app:end -->');
if (start < 0 || end < 0) throw new Error('index.html is missing the app:start / app:end markers');

const out = [
  pickTag(/<title>[^<]*<\/title>/),
  '<meta name="claude:viewport-fit-sides" content="cover">',
  pickTag(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/),
  `<style>\n${read('style.css')}</style>`,
  index.slice(start + '<!-- app:start -->'.length, end).trim(),
  `<script>\n${read('generator.js')}</script>`,
  `<script>\n${read('app.js')}</script>`,
  '',
].join('\n');

const dist = process.argv[2] || path.join(__dirname, '..', 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'artifact.html'), out);
console.log(`wrote ${path.join(dist, 'artifact.html')} (${out.length} bytes)`);
