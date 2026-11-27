// Kiro PreToolUse hook: blocks `git commit` unless the tests, the type check and the asset
// credit check pass. Exit code 2 blocks the tool call and sends stderr back to the agent.
import { execSync } from 'node:child_process';

let input = '';
if (!process.stdin.isTTY) {
  for await (const chunk of process.stdin) input += chunk;
}

let text = input;
try {
  const data = JSON.parse(input);
  text = JSON.stringify(data.tool_input ?? data.toolInput ?? data.input ?? data);
} catch {
  // Not JSON: search the raw text instead.
}
if (!/git(\s+-C\s+\S+)?\s+commit\b/.test(text)) process.exit(0);

const checks = [
  ['npm test', 'tests'],
  ['npm run typecheck', 'type check'],
  ['npm run check:assets', 'asset credit check'],
];
for (const [command, label] of checks) {
  try {
    execSync(command, { stdio: 'pipe' });
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.slice(-2000);
    process.stderr.write(`Commit blocked: the ${label} failed (\`${command}\`).\n${output}\n`);
    process.exit(2);
  }
}
process.exit(0);
