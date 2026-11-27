// Checks that every third-party asset under public/ is credited in Documents/credits.md
// with an allowed license, and that models stay inside the size budget.
// Usage: npm run check:assets
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const ASSET_DIRS = ['public/models', 'public/audio', 'public/textures', 'public/fonts'];
const ALLOWED = ['CC0', 'CC-BY', 'OFL', 'MIT'];
const MAX_MODEL_BYTES = 300 * 1024;

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile() && !entry.name.startsWith('.')) files.push(path);
  }
  return files;
}

/** Rows of the credits table whose File cell holds a `backticked/path`. */
function parseCredits(markdown) {
  const rows = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length < 6) continue;
    const file = cells[1].match(/`([^`]+)`/)?.[1];
    if (file) rows.set(file.replace(/\\/g, '/'), { license: cells[4] });
  }
  return rows;
}

const credits = parseCredits(await readFile('Documents/credits.md', 'utf8'));
const problems = [];
let checked = 0;

for (const dir of ASSET_DIRS) {
  for (const file of await listFiles(dir)) {
    checked++;
    const path = relative('.', file).split(sep).join('/');
    const row = credits.get(path);
    if (!row) {
      problems.push(`${path} is not listed in Documents/credits.md`);
    } else if (!ALLOWED.some((license) => row.license.toUpperCase().startsWith(license))) {
      problems.push(`${path} has license "${row.license}", which is not one of ${ALLOWED.join(', ')}`);
    }
    if (path.endsWith('.glb')) {
      const { size } = await stat(file);
      if (size > MAX_MODEL_BYTES) problems.push(`${path} is ${Math.round(size / 1024)} KB, over the ${MAX_MODEL_BYTES / 1024} KB model budget`);
    }
  }
}

if (problems.length) {
  console.error(`Asset check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Asset check passed: ${checked} third-party asset file(s), all credited${checked ? '' : ' (none yet; all models are built in code)'}.`);
