import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  // Retries: needed to catch/absorb the intentional flaky test (Test B),
  // which is written to fail on attempt #1 and pass on attempt #2.
  retries: 2,

  fullyParallel: true,

  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['html', { open: 'never' }],
  ],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // Automatically boots the Express app before the test run and tears it
  // down after, so `npx playwright test` works standalone.
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
