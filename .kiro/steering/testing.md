---
inclusion: fileMatch
fileMatchPattern: "**/*.test.ts"
---
# Testing conventions

- Vitest for all tests, fast-check for property-based tests.
- Name each property test `Property N: <rule>`, with the same number and wording as the "Correctness properties" section of the spec's design.md, and say which requirement it validates.
- Default to `fc.assert(fc.property(...), { numRuns: 200 })`. Generate numbers with `fc.double({ noNaN: true, noDefaultInfinity: true, min, max })`.
- Test the simulation through its public functions. Do not export internals just for tests.
- A failing property is a finding. Decide whether the code, the property or the requirement is wrong, fix it, and record what happened in `Documents/kiro-usage-log.md`.
