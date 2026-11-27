// Kiro SessionStart hook: prints the time left, the next feature and the last commit,
// so every Kiro session starts with the same context.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const DEADLINE = Date.parse('2026-12-04T22:00:00Z'); // Fri Dec 4, 2:00 PM PT
const TARGET = Date.parse('2026-12-04T16:30:00Z'); // Fri Dec 4, 10:00 PM IST, our own target

const left = (ms) => {
  if (ms <= 0) return 'passed';
  const hours = Math.floor(ms / 3_600_000);
  return `${Math.floor(hours / 24)} days ${hours % 24} hours`;
};

let next = 'see Documents/build-plan.md';
try {
  const plan = readFileSync('Documents/build-plan.md', 'utf8');
  next = plan.split(/\r?\n/).find((line) => line.startsWith('- [ ] **'))?.replace('- [ ] ', '') ?? 'every feature is ticked';
} catch {
  // Keep the default.
}

let last = 'none';
try {
  last = execSync('git log -1 --format="%h %s (%cr)"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || last;
} catch {
  // Not a git repo yet.
}

const now = Date.now();
console.log(
  [
    'Ghostlight Isles session brief',
    `- Kiroween deadline: ${left(DEADLINE - now)} left (our submit target: ${left(TARGET - now)})`,
    `- Next feature: ${next}`,
    `- Last commit: ${last}`,
    '- Before each commit: npm test, npm run typecheck, npm run build, npm run smoke, npm run check:assets',
  ].join('\n'),
);
