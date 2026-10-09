import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 30_000,
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});
