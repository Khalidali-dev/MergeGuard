'use strict';

const {
  analyzeSecrets,
  analyzeAsyncIssues,
  analyzeMissingTests,
  computeHealthScore,
  mapAddedLinesToNumbers,
  analyzePr,
} = require('../src/services/analysisEngine');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal file object as returned by the GitHub API */
function makeFile(filename, patchLines = []) {
  const patch = patchLines.length
    ? `@@ -1,1 +1,${patchLines.length} @@\n` + patchLines.join('\n')
    : '';
  return { filename, patch };
}

// ─────────────────────────────────────────────────────────────────────────────
// mapAddedLinesToNumbers
// ─────────────────────────────────────────────────────────────────────────────

describe('mapAddedLinesToNumbers', () => {
  it('returns empty array for null patch', () => {
    expect(mapAddedLinesToNumbers(null)).toEqual([]);
  });

  it('parses added lines with correct line numbers', () => {
    const patch = `@@ -1,3 +1,4 @@\n context\n+added line\n context2\n+another added`;
    const result = mapAddedLinesToNumbers(patch);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('added line');
    expect(result[1].content).toBe('another added');
  });

  it('ignores deleted lines in line numbering', () => {
    const patch = `@@ -1,2 +1,1 @@\n-deleted\n+added`;
    const result = mapAddedLinesToNumbers(patch);
    expect(result).toHaveLength(1);
    // Hunk starts at +1; deleted line does not advance the new-file counter.
    // The added line is the first line of the new file: lineNumber === 1.
    expect(result[0].lineNumber).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// analyzeSecrets
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeSecrets', () => {
  it('detects AWS access key ID', () => {
    const files = [makeFile('config.js', ['+const key = "AKIAIOSFODNN7EXAMPLE";'])];
    const alerts = analyzeSecrets(files);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].ruleId).toBe('aws-access-key');
    expect(alerts[0].severity).toBe('critical');
  });

  it('detects GitHub PAT (ghp_ prefix)', () => {
    const files = [makeFile('deploy.js', ['+const token = "ghp_abcdefghijklmnopqrstuvwxyz12345678901";'])];
    const alerts = analyzeSecrets(files);
    expect(alerts.some((a) => a.ruleId === 'github-token')).toBe(true);
  });

  it('detects hardcoded password', () => {
    const files = [makeFile('db.js', ['+const password = "supersecret123";'])];
    const alerts = analyzeSecrets(files);
    expect(alerts.some((a) => a.ruleId === 'hardcoded-password')).toBe(true);
  });

  it('detects PEM private key block', () => {
    const files = [makeFile('auth.js', ['+const key = "-----BEGIN RSA PRIVATE KEY-----";'])];
    const alerts = analyzeSecrets(files);
    expect(alerts.some((a) => a.ruleId === 'private-key-block')).toBe(true);
  });

  it('returns no alerts for clean lines', () => {
    const files = [makeFile('index.js', ['+const greeting = "hello world";'])];
    expect(analyzeSecrets(files)).toHaveLength(0);
  });

  it('returns no alerts for removed lines (lines without + prefix)', () => {
    const patch = `@@ -1,1 +1,0 @@\n-const key = "AKIAIOSFODNN7EXAMPLE";`;
    const files = [{ filename: 'old.js', patch }];
    expect(analyzeSecrets(files)).toHaveLength(0);
  });

  it('includes fix recommendation in alert', () => {
    const files = [makeFile('config.js', ['+const key = "AKIAIOSFODNN7EXAMPLE";'])];
    const [alert] = analyzeSecrets(files);
    expect(alert.fix).toMatch(/environment variable/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// analyzeAsyncIssues
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeAsyncIssues', () => {
  it('flags async function without try/catch in the hunk', () => {
    const patch = `@@ -1,3 +1,4 @@\n+async function fetchData() {\n+  const data = await getData();\n+  return data;\n+}`;
    const files = [{ filename: 'api.js', patch }];
    const issues = analyzeAsyncIssues(files);
    expect(issues.some((i) => i.ruleId === 'async-without-try-catch')).toBe(true);
  });

  it('does NOT flag async function that has try/catch', () => {
    const patch =
      `@@ -1,5 +1,6 @@\n` +
      `+async function fetchData() {\n` +
      `+  try {\n` +
      `+    const data = await getData();\n` +
      `+    return data;\n` +
      `+  } catch (err) { console.error(err); }\n` +
      `+}`;
    const files = [{ filename: 'api.js', patch }];
    const issues = analyzeAsyncIssues(files);
    expect(issues.filter((i) => i.ruleId === 'async-without-try-catch')).toHaveLength(0);
  });

  it('flags empty catch block', () => {
    const files = [makeFile('handler.js', ['+} catch (e) {}'])];
    const issues = analyzeAsyncIssues(files);
    expect(issues.some((i) => i.ruleId === 'empty-catch')).toBe(true);
  });

  it('skips non-JS/TS files', () => {
    const files = [makeFile('styles.css', ['+async function x() {}'])];
    expect(analyzeAsyncIssues(files)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// analyzeMissingTests
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeMissingTests', () => {
  it('flags source file with no test counterpart in PR', () => {
    const files = [makeFile('src/utils/parser.js', ['+function parse() {}'])];
    const issues = analyzeMissingTests(files);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('missing-unit-test');
    expect(issues[0].fix).toMatch(/parser\.test/);
  });

  it('does not flag when test file is present in the PR', () => {
    const files = [
      makeFile('src/utils/parser.js', ['+function parse() {}']),
      makeFile('src/utils/parser.test.js', ['+test("parse", () => {})']),
    ];
    expect(analyzeMissingTests(files)).toHaveLength(0);
  });

  it('does not flag test files themselves', () => {
    const files = [makeFile('src/utils/parser.test.js', ['+test("parse", () => {})'])];
    expect(analyzeMissingTests(files)).toHaveLength(0);
  });

  it('does not flag config files', () => {
    const files = [makeFile('jest.config.js', ['+module.exports = {};'])];
    expect(analyzeMissingTests(files)).toHaveLength(0);
  });

  it('does not flag non-JS files', () => {
    const files = [makeFile('README.md', ['+# Hello'])];
    expect(analyzeMissingTests(files)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeHealthScore
// ─────────────────────────────────────────────────────────────────────────────

describe('computeHealthScore', () => {
  it('returns 100 for no findings', () => {
    expect(computeHealthScore([], [])).toBe(100);
  });

  it('deducts 20 for each critical security alert', () => {
    const alerts = [{ severity: 'critical' }, { severity: 'critical' }];
    expect(computeHealthScore(alerts, [])).toBe(60);
  });

  it('floors at 0', () => {
    const alerts = Array(10).fill({ severity: 'critical' });
    expect(computeHealthScore(alerts, [])).toBe(0);
  });

  it('deducts correctly for mixed severities', () => {
    const alerts = [{ severity: 'high' }]; // -10
    const issues = [{ severity: 'medium' }, { severity: 'low' }]; // -5 -2
    expect(computeHealthScore(alerts, issues)).toBe(83);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// analyzePr (integration)
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzePr', () => {
  const mockPr = {
    number: 42,
    title: 'Add feature X',
    user: { login: 'dev' },
    state: 'open',
    html_url: 'https://github.com/owner/repo/pull/42',
    additions: 10,
    deletions: 2,
  };

  it('returns a valid result shape for a clean PR', () => {
    const result = analyzePr({ pr: mockPr, files: [] });
    expect(result).toMatchObject({
      healthScore: expect.any(Number),
      summary: expect.any(String),
      pr: expect.objectContaining({ number: 42 }),
      securityAlerts: [],
      codeIssues: [],
      recommendedFixes: [],
    });
    expect(result.healthScore).toBe(100);
  });

  it('includes secret alerts and deducted score for a dirty PR', () => {
    const files = [
      makeFile('app.js', ['+const apiKey = "AIzaSyD-9tSrke72I6e0a8W6f8LO9KqPqxGn";']),
    ];
    const result = analyzePr({ pr: mockPr, files });
    expect(result.securityAlerts.length).toBeGreaterThan(0);
    expect(result.healthScore).toBeLessThan(100);
    expect(result.recommendedFixes.length).toBeGreaterThan(0);
    expect(result.summary).toMatch(/health score/i);
  });
});
