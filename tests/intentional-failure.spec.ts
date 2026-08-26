import { test, expect } from '@playwright/test';

// Deliberately-failing test used to exercise the CI failure-notification
// pipeline (send-results.ts -> N8N_FAILURE_WEBHOOK_URL). The app always
// renders "Deployment succeeded! Release shipped." on a successful deploy,
// so asserting the literal string "Deploy Success" fails on every attempt,
// including retries, and is reported as a hard failure (not flaky).
test.describe('Intentional Failure (pipeline smoke test)', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/reset');
  });

  test('Test C - deploy result shows exact text "Deploy Success"', async ({ page }) => {
    await page.goto('/');

    await page.click('#deploy-btn');

    await expect(page.locator('#deploy-result')).toHaveText('Deploy Success');
  });
});
