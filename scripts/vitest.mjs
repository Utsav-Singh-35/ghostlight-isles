// Starts Vitest from a working directory with an upper-case Windows drive letter.
//
// When a tool starts `npm test` from "c:\..." instead of "C:\...", Vitest loads its own modules
// twice under the two path spellings and every test file fails with
// "Cannot read properties of undefined (reading 'config')". Kiro's hooks start commands that way.
// Changing the directory before Vitest loads makes both spellings the same.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const fixed = process.cwd().replace(/^[a-z]:/, (drive) => drive.toUpperCase());
process.chdir(fixed);

const require = createRequire(join(fixed, 'package.json'));
const entry = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: 'inherit', cwd: fixed });
process.exit(result.status ?? 1);
