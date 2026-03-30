import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@secure-clawflows/audit': '/packages/audit/src/index.ts',
      '@secure-clawflows/cli': '/packages/cli/src/index.ts',
      '@secure-clawflows/core': '/packages/core/src/index.ts',
      '@secure-clawflows/integrations': '/packages/integrations/src/index.ts',
      '@secure-clawflows/policy-engine': '/packages/policy-engine/src/index.ts',
      '@secure-clawflows/runner': '/packages/runner/src/index.ts',
      '@secure-clawflows/schema': '/packages/schema/src/index.ts',
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
    include: ['packages/**/*.test.ts'],
    testTimeout: 15_000,
  },
});
