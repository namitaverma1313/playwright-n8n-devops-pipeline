/**
 * send-results.ts
 *
 * Parses Playwright's JSON reporter output (test-results/results.json) and
 * forwards results to n8n webhooks:
 *   - Tests that failed even after all retries  -> N8N_FAILURE_WEBHOOK_URL
 *   - Tests that failed at least once but ultimately passed on a retry
 *     ("flaky")                                  -> N8N_FLAKY_WEBHOOK_URL
 *
 * Run manually:   npx tsx send-results.ts
 * Run after tests: npm run test:notify   (runs `playwright test` then this script,
 *                   regardless of whether the test run itself passed or failed)
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// Paste your trial n8n webhook URLs here.
// ============================================================================
const N8N_FAILURE_WEBHOOK_URL =
  process.env.N8N_FAILURE_WEBHOOK_URL ?? 'https://YOUR-N8N-INSTANCE.example.com/webhook/test-failures';
const N8N_FLAKY_WEBHOOK_URL =
  process.env.N8N_FLAKY_WEBHOOK_URL ?? 'https://YOUR-N8N-INSTANCE.example.com/webhook/flaky-tracker';

const REPORT_PATH = path.resolve(process.cwd(), 'test-results/results.json');

// GITHUB_REF looks like "refs/heads/main" in Actions; strip the prefix for readability.
const BRANCH = (process.env.GITHUB_REF ?? 'local').replace(/^refs\/heads\//, '');

// ---- Types matching Playwright's JSON reporter schema ---------------------

interface PwResult {
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  retry: number;
  error?: { message?: string; stack?: string };
}

interface PwTest {
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  projectName: string;
  results: PwResult[];
}

interface PwSpec {
  title: string;
  file: string;
  line: number;
  tests: PwTest[];
}

interface PwSuite {
  title: string;
  file: string;
  specs: PwSpec[];
  suites?: PwSuite[];
}

interface PwReport {
  suites: PwSuite[];
  stats: Record<string, unknown>;
}

// ---- Flattened, webhook-ready shape ----------------------------------------

interface ExtractedTest {
  testName: string;
  file: string;
  line: number;
  project: string;
  finalStatus: PwTest['status'];
  attempts: number;
  durationMs: number;
  errorMessage: string | null;
}

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, '');
}

// testName is a full breadcrumb like "devops.spec.ts > DevOps Release Dashboard > Test B - ...".
// n8n only needs the leaf test title, so keep everything after the last '>'.
function lastTitleSegment(rawTitle: string): string {
  return rawTitle.includes('>') ? rawTitle.split('>').pop()!.trim() : rawTitle;
}

function collectTests(suite: PwSuite, titlePrefix = ''): ExtractedTest[] {
  const prefix = titlePrefix ? `${titlePrefix} > ${suite.title}` : suite.title;

  const specTests: ExtractedTest[] = suite.specs.flatMap((spec) =>
    spec.tests.map((test) => {
      const lastFailure = [...test.results].reverse().find((r) => r.status === 'failed' || r.status === 'timedOut');

      return {
        testName: `${prefix} > ${spec.title}`,
        file: spec.file,
        line: spec.line,
        project: test.projectName,
        finalStatus: test.status,
        attempts: test.results.length,
        durationMs: test.results.reduce((sum, r) => sum + r.duration, 0),
        errorMessage: lastFailure?.error?.message ? stripAnsi(lastFailure.error.message) : null,
      };
    }),
  );

  const nestedTests = (suite.suites ?? []).flatMap((nested) => collectTests(nested, prefix));
  return [...specTests, ...nestedTests];
}

async function postToWebhook(
  url: string,
  placeholderUrl: string,
  payload: Record<string, unknown>,
  kind: 'failure' | 'flaky',
): Promise<void> {
  if (url === placeholderUrl) {
    console.warn(`[send-results] Skipping ${kind} webhook — placeholder URL not replaced yet: ${url}`);
    return;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`[send-results] ${kind} webhook responded with ${res.status} ${res.statusText}`);
    } else {
      console.log(`[send-results] Sent ${kind} payload for "${payload.testName}"`);
    }
  } catch (err) {
    console.error(`[send-results] Failed to reach ${kind} webhook:`, err);
  }
}

async function main(): Promise<void> {
  if (!fs.existsSync(REPORT_PATH)) {
    console.error(`[send-results] Report not found at ${REPORT_PATH}. Run "npm test" first.`);
    process.exit(1);
  }

  const report: PwReport = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'));
  const allTests = report.suites.flatMap((suite) => collectTests(suite));

  const failedTests = allTests.filter((t) => t.finalStatus === 'unexpected');
  const flakyTests = allTests.filter((t) => t.finalStatus === 'flaky');

  console.log(
    `[send-results] Parsed ${allTests.length} test(s): ${failedTests.length} failed, ${flakyTests.length} flaky.`,
  );

  const deliveries: Promise<void>[] = [];

  for (const test of failedTests) {
    deliveries.push(
      postToWebhook(
        N8N_FAILURE_WEBHOOK_URL,
        'https://YOUR-N8N-INSTANCE.example.com/webhook/test-failures',
        {
          event: 'test_failed',
          testName: lastTitleSegment(test.testName),
          file: test.file,
          line: test.line,
          project: test.project,
          status: 'failed',
          attempts: test.attempts,
          durationMs: test.durationMs,
          errorMessage: test.errorMessage,
          branch: BRANCH,
          timestamp: new Date().toISOString(),
        },
        'failure',
      ),
    );
  }

  for (const test of flakyTests) {
    deliveries.push(
      postToWebhook(
        N8N_FLAKY_WEBHOOK_URL,
        'https://YOUR-N8N-INSTANCE.example.com/webhook/flaky-tracker',
        {
          event: 'test_flaky',
          testName: lastTitleSegment(test.testName),
          file: test.file,
          line: test.line,
          project: test.project,
          status: 'flaky',
          attempts: test.attempts,
          durationMs: test.durationMs,
          lastErrorMessage: test.errorMessage,
          branch: BRANCH,
          timestamp: new Date().toISOString(),
        },
        'flaky',
      ),
    );
  }

  await Promise.all(deliveries);

  if (failedTests.length === 0 && flakyTests.length === 0) {
    console.log('[send-results] No failed or flaky tests to report.');
  }
}

main().catch((err) => {
  console.error('[send-results] Unexpected error:', err);
  process.exit(1);
});
