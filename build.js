// Concatenates src/*.js (in name order) into dist/userScript.js as one IIFE.
// No bundler needed: the source is written in TV-compatible JavaScript.
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).sort();
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

let out = `/* ClearFeed TV v${pkg.version} — built ${new Date().toISOString()} */\n(function () {\n'use strict';\n`;
for (const f of files) {
  out += `\n// ===== ${f} =====\n` + fs.readFileSync(path.join(srcDir, f), 'utf8') + '\n';
}
out += '\n})();\n';

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'userScript.js'), out);
console.log(`dist/userScript.js: ${(out.length / 1024).toFixed(1)} KB from ${files.length} files`);
