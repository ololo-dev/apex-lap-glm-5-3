import { defineConfig } from 'vitest/config'

// Coverage measures the rules of the game (src/core) and the headless lap
// runner. The render/UI layer is exercised by the recording pipeline
// (scripts/record.ts -> docs/demo/), not by unit tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/headless.ts', 'src/headless-race.ts'],
      reporter: ['text', 'html'],
    },
  },
})
