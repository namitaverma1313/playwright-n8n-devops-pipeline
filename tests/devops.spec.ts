import { test, expect } from '@playwright/test';

test.describe('DevOps Release Dashboard', () => {

  test.beforeEach(async ({ request }) => {
    // Force a known starting state ("stable") before each test so tests
    // don't depend on ordering or leftover state from a previous test.
    await request.post('/api/reset');
  });

  // ---------------------------------------------------------------------
  // Test A: standard UI click test — always passes while the app is stable.
  // ---------------------------------------------------------------------
  test('Test A - Deploy succeeds when environment is stable', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#env-status')).toHaveText('Environment Stable');

    await page.click('#deploy-btn');

    await expect(page.locator('#deploy-result')).toHaveText(/Deployment succeeded/);
    await expect(page.locator('#deploy-result')).toHaveClass('success');
  });

  // ---------------------------------------------------------------------
  // Test B: intentional "flaky" test.
  //
  // `testInfo.retry` is Playwright's built-in attempt counter: it is 0 on
  // the first run, 1 on the first retry, 2 on the second retry, etc. We use
  // it as our local counter to deliberately fail attempt #1 and pass on the
  // retry — demonstrating how `retries: 2` in playwright.config.ts absorbs
  // real-world flakiness.
  // ---------------------------------------------------------------------
  test('Test B - Flaky test fails on first attempt, passes on retry', async ({ page }, testInfo) => {
    await page.goto('/');

    const attempt = testInfo.retry; // 0 = first run, 1 = first retry, ...
    console.log(`Flaky test attempt #${attempt + 1} (retry index ${attempt})`);

    if (attempt === 0) {
      // Intentionally force a failure on the very first attempt.
      expect(attempt, 'Simulated flakiness: forcing failure on first attempt').toBe(1);
    } else {
      // Passes once Playwright retries the test.
      expect(attempt).toBeGreaterThanOrEqual(1);
      await expect(page.locator('#env-status')).toBeVisible();
    }
  });

});
