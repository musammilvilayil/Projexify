const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = [
  path.join(__dirname, '..', 'server.js'),
  path.join(__dirname, '..', 'backend'),
  path.join(__dirname, '..', 'scripts'),
  path.join(__dirname, '..', 'frontend', 'public', 'assets', 'js'),
  path.join(__dirname, '..', 'frontend', 'public', 'js'),
];

const files = [];

function walk(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (target.endsWith('.js')) files.push(target);
    return;
  }
  for (const entry of fs.readdirSync(target)) {
    if (entry === 'node_modules') continue;
    walk(path.join(target, entry));
  }
}

roots.forEach(walk);

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(`Syntax error: ${path.relative(process.cwd(), file)}`);
    console.error(result.stderr || result.stdout);
  }
}

if (failed) process.exit(1);
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
