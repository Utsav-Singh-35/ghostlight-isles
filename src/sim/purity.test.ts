import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const simDir = fileURLToPath(new URL('.', import.meta.url));

/** Things the simulation must never touch: they would make battles impossible to replay. */
const BANNED: ReadonlyArray<[RegExp, string]> = [
  [/Math\.random/, 'Math.random (use createRng)'],
  [/\bDate\b/, 'Date (use the tick count)'],
  [/\bperformance\b/, 'performance (use the tick count)'],
  [/\bset(Timeout|Interval)\b/, 'timers'],
  [/\brequestAnimationFrame\b/, 'requestAnimationFrame'],
  [/\bdocument\b/, 'the DOM'],
  [/\bwindow\b/, 'the window'],
  [/from\s+['"]three/, 'three.js'],
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('sailing spec: purity', () => {
  // Feature: sailing, Property 12. Validates: Requirement 5.4
  it('Property 12: the simulation is pure', () => {
    const files = readdirSync(simDir).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(0);
    const problems: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(join(simDir, file), 'utf8'));
      for (const [pattern, label] of BANNED) {
        if (pattern.test(code)) problems.push(`${file} uses ${label}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
