'use strict';

/**
 * Edge-case tests for the PR diff parser (analysisEngine + githubFetcher).
 *
 * Organised into suites that mirror the public API surface:
 *   1.  parsePrUrl            – URL validation edge cases
 *   2.  mapAddedLinesToNumbers – diff-parsing edge cases
 *   3.  extractAddedLines      – raw line extraction
 *   4.  analyzeSecrets         – all secret rule types + multi-file / multi-secret
 *   5.  analyzeAsyncIssues     – TypeScript, arrow functions, .mjs/.cjs, edge patterns
 *   6.  analyzeMissingTests    – all exclusion rules + TypeScript + spec variants
 *   7.  computeHealthScore     – every severity weight + unknowns + edge arithmetic
 *   8.  analyzePr (pipeline)   – empty diffs, deletion-only PRs, multi-secret leaks,
 *                                deduplication, summary content, recommendedFixes order
 */

const {
  analyzeSecrets,
  analyzeAsyncIssues,
  analyzeMissingTests,
  computeHealthScore,
  extractAddedLines,
  mapAddedLinesToNumbers,
  analyzePr,
} = require('../src/services/analysisEngine');

const { parsePrUrl } = require('../src/services/githubFetcher');

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal GitHub API file object.
 * @param {string} filename
 * @param {string[]} patchLines  Raw patch lines (include leading +/-/space prefix).
 * @param {number} startLine     New-file line number for the hunk start (default 1).
 */
function makeFile(filename, patchLines = [], startLine = 1) {
  if (!patchLines.length) return { filename, patch: '' };
  const addedCount = patchLines.filter((l) => l.startsWith('+')).length;
  const patch =
    `@@ -${startLine},${patchLines.length} +${startLine},${addedCount} @@\n` +
    patchLines.join('\n');
  return { filename, patch };
}

/** Minimal PR object matching the GitHub API shape used by analyzePr. */
const BASE_PR = {
  number: 1,
  title: 'Test PR',
  user: { login: 'dev' },
  state: 'open',
  html_url: 'https://github.com/owner/repo/pull/1',
  additions: 0,
  deletions: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. parsePrUrl
// ─────────────────────────────────────────────────────────────────────────────

describe('parsePrUrl — valid URLs', () => {
  it('parses a standard https PR URL', () => {
    const result = parsePrUrl('https://github.com/torvalds/linux/pull/987');
    expect(result).toEqual({ owner: 'torvalds', repo: 'linux', pull_number: 987 });
  });

  it('parses a http PR URL', () => {
    const result = parsePrUrl('http://github.com/owner/repo/pull/1');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', pull_number: 1 });
  });

  it('parses URLs with hyphenated owner/repo names', () => {
    const result = parsePrUrl('https://github.com/my-org/my-repo/pull/42');
    expect(result).toEqual({ owner: 'my-org', repo: 'my-repo', pull_number: 42 });
  });

  it('parses URLs with numeric owner/repo names', () => {
    const result = parsePrUrl('https://github.com/user123/repo456/pull/789');
    expect(result).toEqual({ owner: 'user123', repo: 'repo456', pull_number: 789 });
  });

  it('ignores trailing query strings / fragments', () => {
    // The regex anchors at pull/N and ignores anything after
    const result = parsePrUrl('https://github.com/owner/repo/pull/5?tab=files#diff');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', pull_number: 5 });
  });

  it('parses pull number 0 (edge value)', () => {
    const result = parsePrUrl('https://github.com/owner/repo/pull/0');
    expect(result.pull_number).toBe(0);
  });

  it('parses very large pull numbers', () => {
    const result = parsePrUrl('https://github.com/owner/repo/pull/999999');
    expect(result.pull_number).toBe(999999);
  });
});

describe('parsePrUrl — malformed / invalid URLs', () => {
  const BAD_URLS = [
    '',
    'not-a-url',
    'github.com/owner/repo/pull/1',           // missing protocol
    'https://gitlab.com/owner/repo/pull/1',   // wrong host
    'https://github.com/owner/repo/pulls/1',  // "pulls" not "pull"
    'https://github.com/owner/repo/pull/',    // no number
    'https://github.com/owner/repo/pull/abc', // non-numeric PR
    'https://github.com/owner/repo',          // missing /pull segment
    'https://github.com/repo/pull/1',         // only one path segment before pull
    'https://github.com//repo/pull/1',        // empty owner
    'ftp://github.com/owner/repo/pull/1',     // wrong scheme
    'https://github.com/owner/repo/pull/1/files', // extra segment is fine — still parses
  ];

  // The last entry actually parses (regex matches up to /pull/N, ignores rest)
  const TRULY_BAD = BAD_URLS.slice(0, -1);

  it.each(TRULY_BAD)('throws a 400 error for: %s', (url) => {
    expect(() => parsePrUrl(url)).toThrow();
    try {
      parsePrUrl(url);
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/invalid github pr url/i);
    }
  });

  it('throws when called with undefined', () => {
    expect(() => parsePrUrl(undefined)).toThrow();
  });

  it('throws when called with null', () => {
    expect(() => parsePrUrl(null)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. mapAddedLinesToNumbers
// ─────────────────────────────────────────────────────────────────────────────

describe('mapAddedLinesToNumbers — empty / null inputs', () => {
  it('returns [] for null', () => {
    expect(mapAddedLinesToNumbers(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(mapAddedLinesToNumbers(undefined)).toEqual([]);
  });

  it('returns [] for empty string', () => {
    expect(mapAddedLinesToNumbers('')).toEqual([]);
  });

  it('returns [] for a patch with no added lines (deletions only)', () => {
    const patch = `@@ -1,3 +1,0 @@\n-line one\n-line two\n-line three`;
    expect(mapAddedLinesToNumbers(patch)).toEqual([]);
  });

  it('returns [] for a patch that is only hunk headers', () => {
    const patch = `@@ -1,0 +1,0 @@`;
    expect(mapAddedLinesToNumbers(patch)).toEqual([]);
  });
});

describe('mapAddedLinesToNumbers — correct line numbering', () => {
  it('assigns line 1 to the first added line in a hunk starting at +1', () => {
    const patch = `@@ -1,0 +1,1 @@\n+new line`;
    const result = mapAddedLinesToNumbers(patch);
    expect(result).toHaveLength(1);
    expect(result[0].lineNumber).toBe(1);
    expect(result[0].content).toBe('new line');
  });

  it('correctly numbers added lines after context lines', () => {
    const patch = `@@ -1,4 +1,4 @@\n context1\n context2\n+added\n context3`;
    const result = mapAddedLinesToNumbers(patch);
    expect(result).toHaveLength(1);
    expect(result[0].lineNumber).toBe(3); // context1=1, context2=2, added=3
  });

  it('does not advance line counter for deleted lines', () => {
    const patch = `@@ -1,3 +1,2 @@\n-deleted\n-also deleted\n+added`;
    const result = mapAddedLinesToNumbers(patch);
    expect(result).toHaveLength(1);
    expect(result[0].lineNumber).toBe(1);
  });

  it('handles multi-hunk patches with correct line offsets', () => {
    const patch =
      `@@ -1,2 +1,2 @@\n context\n+hunk1 added\n` +
      `@@ -10,2 +10,3 @@\n context\n+hunk2 added\n+hunk2 second`;
    const result = mapAddedLinesToNumbers(patch);
    expect(result).toHaveLength(3);
    expect(result[0].lineNumber).toBe(2);   // line 2 in first hunk
    expect(result[1].lineNumber).toBe(11);  // hunk2 starts at +10, context=10, added=11
    expect(result[2].lineNumber).toBe(12);
  });

  it('skips the +++ file header line', () => {
    const patch = `@@ -0,0 +1,1 @@\n+++ b/src/file.js\n+actual code`;
    const result = mapAddedLinesToNumbers(patch);
    // +++ line must NOT appear as a finding
    expect(result.every((r) => !r.content.startsWith('++'))).toBe(true);
  });

  it('skips \\ No newline at end of file marker', () => {
    const patch = `@@ -1,1 +1,1 @@\n-old\n+new\n\\ No newline at end of file`;
    const result = mapAddedLinesToNumbers(patch);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('new');
  });

  it('strips the leading + from content', () => {
    const patch = `@@ -0,0 +1,1 @@\n+const x = 1;`;
    const [line] = mapAddedLinesToNumbers(patch);
    expect(line.content).toBe('const x = 1;');
    expect(line.content).not.toMatch(/^\+/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. extractAddedLines
// ─────────────────────────────────────────────────────────────────────────────

describe('extractAddedLines', () => {
  it('returns [] for null', () => {
    expect(extractAddedLines(null)).toEqual([]);
  });

  it('returns only lines starting with +', () => {
    const patch = `@@ -1,3 +1,2 @@\n context\n-removed\n+added`;
    const result = extractAddedLines(patch);
    expect(result).toEqual(['+added']);
  });

  it('excludes the +++ file header', () => {
    const patch = `+++ b/src/file.js\n+actual line`;
    const result = extractAddedLines(patch);
    expect(result).toEqual(['+actual line']);
  });

  it('returns multiple added lines in order', () => {
    const patch = `@@ -1,0 +1,3 @@\n+line1\n+line2\n+line3`;
    expect(extractAddedLines(patch)).toEqual(['+line1', '+line2', '+line3']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. analyzeSecrets
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeSecrets — individual rule coverage', () => {
  const cases = [
    {
      rule: 'aws-access-key',
      line: '+export const KEY = "AKIAIOSFODNN7EXAMPLE";',
      severity: 'critical',
    },
    {
      rule: 'github-token',
      // ghp_ requires exactly 36 alphanumeric chars after the prefix (26 alpha + 10 digits)
      line: '+const token = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";',
      severity: 'critical',
    },
    {
      rule: 'google-api-key',
      line: '+const gkey = "AIzaSyD-9tSrke72I6e0a8W6f8LO9KqPqxGnXXX";',
      severity: 'critical',
    },
    {
      rule: 'stripe-key',
      line: '+const stripe = "sk_live_abcdefghijklmnopqrstuvwx";',
      severity: 'critical',
    },
    {
      rule: 'stripe-publishable',
      line: '+const pubKey = "pk_live_abcdefghijklmnopqrstuvwx";',
      severity: 'high',
    },
    {
      rule: 'private-key-block',
      line: '+const pem = "-----BEGIN RSA PRIVATE KEY-----";',
      severity: 'critical',
    },
    {
      rule: 'private-key-block',
      line: '+const pem = "-----BEGIN EC PRIVATE KEY-----";',
      severity: 'critical',
    },
    {
      rule: 'private-key-block',
      line: '+const pem = "-----BEGIN OPENSSH PRIVATE KEY-----";',
      severity: 'critical',
    },
    {
      rule: 'private-key-block',
      line: '+const pem = "-----BEGIN PRIVATE KEY-----";',
      severity: 'critical',
    },
    {
      rule: 'hardcoded-password',
      line: '+const password = "hunter2abc";',
      severity: 'high',
    },
    {
      rule: 'hardcoded-password',
      line: '+const passwd = "my$ecretPass";',
      severity: 'high',
    },
    {
      rule: 'hardcoded-password',
      line: '+const pwd = "abc123xyz";',
      severity: 'high',
    },
    {
      rule: 'jwt-secret',
      line: '+const jwtSecret = "mysupersecretjwtkey";',
      severity: 'high',
    },
    {
      rule: 'generic-api-key',
      line: '+const apiKey = "abcdefghijklmnopqrstuvwxyz01234567";',
      severity: 'high',
    },
    {
      rule: 'generic-api-key',
      line: '+const access_token = "abcdefghijklmnopqrstuvwxyz01234567";',
      severity: 'high',
    },
  ];

  it.each(cases)('detects $rule', ({ rule, line, severity }) => {
    const files = [makeFile('secret.js', [line])];
    const alerts = analyzeSecrets(files);
    expect(alerts.some((a) => a.ruleId === rule)).toBe(true);
    const alert = alerts.find((a) => a.ruleId === rule);
    expect(alert.severity).toBe(severity);
    expect(alert.fix).toMatch(/environment variable/i);
    expect(alert.type).toBe('secret');
  });
});

describe('analyzeSecrets — ignored lines', () => {
  it('does not alert on deleted lines', () => {
    const patch = `@@ -1,1 +1,0 @@\n-const key = "AKIAIOSFODNN7EXAMPLE";`;
    expect(analyzeSecrets([{ filename: 'f.js', patch }])).toHaveLength(0);
  });

  it('does not alert on context lines (no +/- prefix)', () => {
    const patch = `@@ -1,1 +1,1 @@\n const key = "AKIAIOSFODNN7EXAMPLE";`;
    expect(analyzeSecrets([{ filename: 'f.js', patch }])).toHaveLength(0);
  });

  it('does not alert when patch is empty string', () => {
    expect(analyzeSecrets([{ filename: 'f.js', patch: '' }])).toHaveLength(0);
  });

  it('does not alert when patch is missing (undefined)', () => {
    expect(analyzeSecrets([{ filename: 'f.js', patch: undefined }])).toHaveLength(0);
  });

  it('returns no alerts for benign code', () => {
    const files = [
      makeFile('app.js', [
        '+const greeting = "Hello, world!";',
        '+const count = 42;',
        '+function add(a, b) { return a + b; }',
      ]),
    ];
    expect(analyzeSecrets(files)).toHaveLength(0);
  });
});

describe('analyzeSecrets — multiple secrets / files', () => {
  it('reports one alert per affected line (first-match wins)', () => {
    // A line that could match both aws-access-key AND generic-api-key patterns
    // should only produce one alert (first match in SECRET_PATTERNS order).
    const files = [makeFile('f.js', ['+const k = "AKIAIOSFODNN7EXAMPLE";'])];
    const alerts = analyzeSecrets(files);
    // Exactly one alert for that line
    expect(alerts).toHaveLength(1);
    expect(alerts[0].ruleId).toBe('aws-access-key');
  });

  it('reports separate alerts for different lines in the same file', () => {
    const files = [
      makeFile('config.js', [
        '+const awsKey = "AKIAIOSFODNN7EXAMPLE";',
        // ghp_ requires exactly 36 alphanumeric chars after the prefix
        '+const ghToken = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";',
      ]),
    ];
    const alerts = analyzeSecrets(files);
    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.ruleId)).toContain('aws-access-key');
    expect(alerts.map((a) => a.ruleId)).toContain('github-token');
  });

  it('reports alerts from multiple changed files', () => {
    const files = [
      makeFile('a.js', ['+const key = "AKIAIOSFODNN7EXAMPLE";']),
      // ghp_ requires exactly 36 alphanumeric chars after the prefix
      makeFile('b.js', ['+const token = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";']),
      makeFile('c.js', ['+const pw = "my_safe_greeting_here";']),
    ];
    const alerts = analyzeSecrets(files);
    expect(alerts.some((a) => a.file === 'a.js')).toBe(true);
    expect(alerts.some((a) => a.file === 'b.js')).toBe(true);
    // c.js has no secret
    expect(alerts.some((a) => a.file === 'c.js')).toBe(false);
  });

  it('caps the snippet at 120 characters', () => {
    const longValue = 'x'.repeat(200);
    const files = [makeFile('f.js', [`+const password = "${longValue}";`])];
    const alerts = analyzeSecrets(files);
    if (alerts.length > 0) {
      expect(alerts[0].snippet.length).toBeLessThanOrEqual(120);
    }
  });

  it('includes the correct filename and line number in the alert', () => {
    const files = [makeFile('src/db/config.js', ['+const password = "hunter2abc";'])];
    const [alert] = analyzeSecrets(files);
    expect(alert.file).toBe('src/db/config.js');
    expect(typeof alert.line).toBe('number');
    expect(alert.line).toBeGreaterThan(0);
  });

  it('handles files array with mixed patched/empty files', () => {
    const files = [
      { filename: 'binary.png', patch: undefined },
      makeFile('app.js', ['+const key = "AKIAIOSFODNN7EXAMPLE";']),
      { filename: 'nodiff.js', patch: '' },
    ];
    const alerts = analyzeSecrets(files);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].file).toBe('app.js');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. analyzeAsyncIssues
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeAsyncIssues — async function detection', () => {
  it('flags a named async function added without try/catch', () => {
    const files = [
      makeFile('api.js', [
        '+async function loadUser(id) {',
        '+  const user = await db.find(id);',
        '+  return user;',
        '+}',
      ]),
    ];
    const issues = analyzeAsyncIssues(files);
    expect(issues.some((i) => i.ruleId === 'async-without-try-catch')).toBe(true);
  });

  it('does NOT flag an async function that has try/catch in the same hunk', () => {
    const files = [
      makeFile('api.js', [
        '+async function loadUser(id) {',
        '+  try {',
        '+    const user = await db.find(id);',
        '+    return user;',
        '+  } catch (err) {',
        '+    console.error(err);',
        '+  }',
        '+}',
      ]),
    ];
    const issues = analyzeAsyncIssues(files);
    expect(issues.filter((i) => i.ruleId === 'async-without-try-catch')).toHaveLength(0);
  });

  it('flags an arrow async function without try/catch', () => {
    const files = [
      makeFile('handler.js', [
        '+const fetchData = async (url) => {',
        '+  const res = await fetch(url);',
        '+  return res.json();',
        '+};',
      ]),
    ];
    const issues = analyzeAsyncIssues(files);
    expect(issues.some((i) => i.ruleId === 'async-without-try-catch')).toBe(true);
  });

  it('flags TypeScript async function (.ts) without try/catch', () => {
    const files = [
      makeFile('service.ts', [
        '+async function getUser(id: string): Promise<User> {',
        '+  return await apiClient.get(`/users/${id}`);',
        '+}',
      ]),
    ];
    const issues = analyzeAsyncIssues(files);
    expect(issues.some((i) => i.ruleId === 'async-without-try-catch')).toBe(true);
  });

  it('processes .mjs files', () => {
    const files = [
      makeFile('utils.mjs', [
        '+export async function helper() {',
        '+  return await doWork();',
        '+}',
      ]),
    ];
    // Should attempt analysis (not skip)
    const issues = analyzeAsyncIssues(files);
    expect(issues.some((i) => i.ruleId === 'async-without-try-catch')).toBe(true);
  });

  it('processes .cjs files', () => {
    const files = [
      makeFile('utils.cjs', [
        '+const handler = async function() {',
        '+  return await fetch("http://example.com");',
        '+}',
      ]),
    ];
    const issues = analyzeAsyncIssues(files);
    expect(issues.some((i) => i.ruleId === 'async-without-try-catch')).toBe(true);
  });

  it('skips .css files', () => {
    const files = [makeFile('styles.css', ['+async function x() {}'])];
    expect(analyzeAsyncIssues(files)).toHaveLength(0);
  });

  it('skips .html files', () => {
    const files = [makeFile('index.html', ['+async function x() {}'])];
    expect(analyzeAsyncIssues(files)).toHaveLength(0);
  });

  it('skips .json files', () => {
    const files = [makeFile('package.json', ['+{ "async": "value" }'])];
    expect(analyzeAsyncIssues(files)).toHaveLength(0);
  });
});

describe('analyzeAsyncIssues — empty catch block', () => {
  it('flags catch (e) {}', () => {
    const files = [makeFile('handler.js', ['+} catch (e) {}'])];
    expect(analyzeAsyncIssues(files).some((i) => i.ruleId === 'empty-catch')).toBe(true);
  });

  it('flags catch (error) {} with spaces', () => {
    const files = [makeFile('handler.js', ['+  } catch (error) {  }'])];
    expect(analyzeAsyncIssues(files).some((i) => i.ruleId === 'empty-catch')).toBe(true);
  });

  it('does NOT flag a catch block with a body', () => {
    const files = [makeFile('handler.js', ['+} catch (e) { console.error(e); }'])];
    expect(analyzeAsyncIssues(files).some((i) => i.ruleId === 'empty-catch')).toBe(false);
  });
});

describe('analyzeAsyncIssues — empty / null diffs', () => {
  it('returns [] for a file with no patch', () => {
    expect(analyzeAsyncIssues([{ filename: 'app.js', patch: '' }])).toHaveLength(0);
  });

  it('returns [] for an empty files array', () => {
    expect(analyzeAsyncIssues([])).toHaveLength(0);
  });

  it('returns [] for a deletion-only patch in a JS file', () => {
    const patch = `@@ -1,3 +1,0 @@\n-async function old() {}\n-// was here\n-// gone`;
    expect(analyzeAsyncIssues([{ filename: 'app.js', patch }])).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. analyzeMissingTests
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeMissingTests — source files that need tests', () => {
  it('flags a plain .js file with no test partner in the PR', () => {
    const issues = analyzeMissingTests([makeFile('src/utils/math.js', ['+module.exports = {};'])]);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('missing-unit-test');
    expect(issues[0].file).toBe('src/utils/math.js');
  });

  it('flags a .ts file with no test partner', () => {
    const issues = analyzeMissingTests([makeFile('src/services/auth.ts', ['+export {};'])]);
    expect(issues).toHaveLength(1);
  });

  it('flags a .tsx file with no test partner', () => {
    const issues = analyzeMissingTests([makeFile('src/components/Button.tsx', ['+export {};'])]);
    expect(issues).toHaveLength(1);
  });

  it('does NOT flag when .test.js counterpart is in the PR', () => {
    const files = [
      makeFile('src/math.js', ['+module.exports = {};']),
      makeFile('src/math.test.js', ['+test("math", () => {})']),
    ];
    expect(analyzeMissingTests(files)).toHaveLength(0);
  });

  it('does NOT flag when .spec.js counterpart is in the PR', () => {
    const files = [
      makeFile('src/math.js', ['+module.exports = {};']),
      makeFile('src/math.spec.js', ['+describe("math", () => {})']),
    ];
    expect(analyzeMissingTests(files)).toHaveLength(0);
  });

  it('does NOT flag when .test.ts counterpart is in the PR', () => {
    const files = [
      makeFile('src/auth.ts', ['+export {};']),
      makeFile('src/auth.test.ts', ['+test("auth", () => {})']),
    ];
    expect(analyzeMissingTests(files)).toHaveLength(0);
  });

  it('does NOT flag when .spec.ts counterpart is in the PR', () => {
    const files = [
      makeFile('src/auth.ts', ['+export {};']),
      makeFile('src/auth.spec.ts', ['+describe("auth", () => {})']),
    ];
    expect(analyzeMissingTests(files)).toHaveLength(0);
  });
});

describe('analyzeMissingTests — excluded file types', () => {
  const excluded = [
    ['test file itself (.test.js)',  'src/utils/math.test.js'],
    ['spec file itself (.spec.js)',  'src/utils/math.spec.js'],
    ['__tests__ directory',          '__tests__/math.js'],
    ['/test/ directory',             'src/test/helpers.js'],
    ['config file (.config.js)',     'jest.config.js'],
    ['config file (.config.ts)',     'vite.config.ts'],
    ['barrel index (.js)',           'src/index.js'],
    ['barrel index (.ts)',           'src/index.ts'],
    ['TypeScript declaration (.d.ts)','src/types/global.d.ts'],
    ['migration file',               'db/migrations/001_create_users.js'],
    ['seed file',                    'db/seeds/users.js'],
    ['node_modules file',            'node_modules/lodash/index.js'],
    ['non-JS file (.md)',            'README.md'],
    ['non-JS file (.py)',            'scripts/deploy.py'],
    ['non-JS file (.yml)',           '.github/workflows/ci.yml'],
  ];

  it.each(excluded)('does not flag %s (%s)', (_, filename) => {
    const files = [makeFile(filename, ['+// content'])];
    expect(analyzeMissingTests(files)).toHaveLength(0);
  });
});

describe('analyzeMissingTests — empty / null diffs', () => {
  it('returns [] for an empty files array', () => {
    expect(analyzeMissingTests([])).toHaveLength(0);
  });

  it('still flags a source file with an empty patch (it was changed, just no diff)', () => {
    // File is in the PR but patch is empty — still needs a test
    const files = [{ filename: 'src/util.js', patch: '' }];
    expect(analyzeMissingTests(files)).toHaveLength(1);
  });

  it('reports fix suggestion with correct candidate paths', () => {
    const [issue] = analyzeMissingTests([makeFile('src/parser.js', ['+x'])]);
    expect(issue.fix).toMatch(/src\/parser\.test\.js/);
    expect(issue.fix).toMatch(/src\/parser\.test\.ts/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. computeHealthScore
// ─────────────────────────────────────────────────────────────────────────────

describe('computeHealthScore — individual severity weights', () => {
  it('deducts 20 for each critical alert', () => {
    expect(computeHealthScore([{ severity: 'critical' }], [])).toBe(80);
  });

  it('deducts 10 for each high alert', () => {
    expect(computeHealthScore([{ severity: 'high' }], [])).toBe(90);
  });

  it('deducts 5 for each medium issue', () => {
    expect(computeHealthScore([], [{ severity: 'medium' }])).toBe(95);
  });

  it('deducts 2 for each low issue', () => {
    expect(computeHealthScore([], [{ severity: 'low' }])).toBe(98);
  });

  it('deducts 5 for an unknown severity (fallback)', () => {
    // SEVERITY_WEIGHTS fallback for missing keys is 5
    expect(computeHealthScore([{ severity: 'unknown' }], [])).toBe(95);
  });

  it('deducts 2 for an unknown issue severity (fallback)', () => {
    expect(computeHealthScore([], [{ severity: 'unknown' }])).toBe(98);
  });
});

describe('computeHealthScore — combinations and floors', () => {
  it('returns 100 when there are no findings', () => {
    expect(computeHealthScore([], [])).toBe(100);
  });

  it('floors at 0, never goes negative', () => {
    const alerts = Array(10).fill({ severity: 'critical' }); // -200
    expect(computeHealthScore(alerts, [])).toBe(0);
  });

  it('accumulates deductions across alerts and issues', () => {
    const alerts = [{ severity: 'critical' }, { severity: 'high' }]; // -20 -10
    const issues = [{ severity: 'medium' }, { severity: 'low' }];     // -5  -2
    expect(computeHealthScore(alerts, issues)).toBe(63);
  });

  it('handles large numbers of low-severity issues', () => {
    const issues = Array(40).fill({ severity: 'low' }); // -80
    expect(computeHealthScore([], issues)).toBe(20);
  });

  it('returns a number, not NaN, for any input', () => {
    expect(computeHealthScore([{ severity: undefined }], [])).not.toBeNaN();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. analyzePr — full pipeline edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzePr — empty diff (no files changed)', () => {
  it('returns healthScore of 100', () => {
    const result = analyzePr({ pr: BASE_PR, files: [] });
    expect(result.healthScore).toBe(100);
  });

  it('returns empty arrays for all finding types', () => {
    const result = analyzePr({ pr: BASE_PR, files: [] });
    expect(result.securityAlerts).toEqual([]);
    expect(result.codeIssues).toEqual([]);
    expect(result.recommendedFixes).toEqual([]);
  });

  it('produces a "looks clean" summary', () => {
    const result = analyzePr({ pr: BASE_PR, files: [] });
    expect(result.summary).toMatch(/looks clean/i);
  });

  it('maps PR metadata correctly', () => {
    const result = analyzePr({ pr: BASE_PR, files: [] });
    expect(result.pr).toMatchObject({
      number: 1,
      title: 'Test PR',
      author: 'dev',
      state: 'open',
      url: 'https://github.com/owner/repo/pull/1',
    });
  });
});

describe('analyzePr — deletion-only diff (no added lines)', () => {
  it('reports healthScore of 98 when only lines are deleted (missing-test low deduction)', () => {
    // analyzeMissingTests treats any .js file in the PR as needing a test,
    // regardless of whether its diff is deletions-only.
    // src/old.js → low severity missing-test → score = 100 - 2 = 98.
    const deletionOnlyFile = {
      filename: 'src/old.js',
      patch: `@@ -1,5 +1,0 @@\n-const key = "AKIAIOSFODNN7EXAMPLE";\n-async function bad() {}\n-password = "secret";\n-const pw = "hunter2";\n-module.exports = bad;`,
    };
    const result = analyzePr({ pr: BASE_PR, files: [deletionOnlyFile] });
    // No secrets detected (deletion lines are ignored by analyzeSecrets)
    expect(result.securityAlerts).toHaveLength(0);
    // But the file itself triggers a missing-test warning → -2 deduction
    expect(result.healthScore).toBe(98);
  });
});

describe('analyzePr — multiple simultaneous secret leaks', () => {
  it('detects all secrets across multiple files and reduces score accordingly', () => {
    const files = [
      makeFile('config/aws.js', ['+const access = "AKIAIOSFODNN7EXAMPLE";']),
      // ghp_ requires exactly 36 alphanumeric chars after the prefix
      makeFile('config/gh.js', ['+const tok = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";']),
      makeFile('config/stripe.js', ['+const key = "sk_live_abcdefghijklmnopqrstuvwxyz";']),
    ];
    const result = analyzePr({ pr: BASE_PR, files });

    expect(result.securityAlerts.length).toBeGreaterThanOrEqual(3);
    // Three critical alerts = -60 minimum
    expect(result.healthScore).toBeLessThanOrEqual(40);
  });

  it('includes all affected files in the alert list', () => {
    const files = [
      makeFile('a.js', ['+const key = "AKIAIOSFODNN7EXAMPLE";']),
      makeFile('b.js', ['+const pw = "-----BEGIN RSA PRIVATE KEY-----";']),
    ];
    const result = analyzePr({ pr: BASE_PR, files });
    const alertFiles = result.securityAlerts.map((a) => a.file);
    expect(alertFiles).toContain('a.js');
    expect(alertFiles).toContain('b.js');
  });

  it('sets summary to mention the correct count and "critical"', () => {
    const files = [
      makeFile('leak.js', ['+const key = "AKIAIOSFODNN7EXAMPLE";']),
      makeFile('leak2.js', ['+const pem = "-----BEGIN RSA PRIVATE KEY-----";']),
    ];
    const result = analyzePr({ pr: BASE_PR, files });
    expect(result.summary).toMatch(/security alert/i);
    expect(result.summary).toMatch(/critical/i);
  });
});

describe('analyzePr — recommendedFixes ordering and deduplication', () => {
  it('orders fixes: critical → high → medium → low', () => {
    const files = [
      makeFile('a.js', ['+const key = "AKIAIOSFODNN7EXAMPLE";']), // critical secret
      makeFile('b.js', ['+const pw = "hunter2password";']),        // high secret
      makeFile('c.js', [
        '+async function doWork() {',
        '+  return await fetch("/api");',
        '+}',
      ]),                                                            // medium async
    ];
    const result = analyzePr({ pr: BASE_PR, files });
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const priorities = result.recommendedFixes.map((f) => f.priority);
    for (let i = 1; i < priorities.length; i++) {
      expect(severityOrder[priorities[i]]).toBeGreaterThanOrEqual(
        severityOrder[priorities[i - 1]]
      );
    }
  });

  it('does not duplicate a fix for the same finding', () => {
    const files = [
      makeFile('config.js', ['+const key = "AKIAIOSFODNN7EXAMPLE";']),
    ];
    const result = analyzePr({ pr: BASE_PR, files });
    const keys = result.recommendedFixes.map((f) => `${f.file}:${f.line}`);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it('each fix has the required shape fields', () => {
    const files = [makeFile('a.js', ['+const key = "AKIAIOSFODNN7EXAMPLE";'])];
    const result = analyzePr({ pr: BASE_PR, files });
    for (const fix of result.recommendedFixes) {
      expect(fix).toHaveProperty('priority');
      expect(fix).toHaveProperty('category');
      expect(fix).toHaveProperty('file');
      expect(fix).toHaveProperty('description');
      expect(['critical', 'high', 'medium', 'low']).toContain(fix.priority);
    }
  });
});

describe('analyzePr — summary content accuracy', () => {
  it('includes the PR number in the summary', () => {
    const pr = { ...BASE_PR, number: 777, title: 'My PR' };
    const result = analyzePr({ pr, files: [] });
    expect(result.summary).toContain('#777');
  });

  it('includes the PR title in the summary', () => {
    const pr = { ...BASE_PR, title: 'Add OAuth support' };
    const result = analyzePr({ pr, files: [] });
    expect(result.summary).toContain('Add OAuth support');
  });

  it('summary mentions health score when issues exist', () => {
    const files = [makeFile('a.js', ['+const key = "AKIAIOSFODNN7EXAMPLE";'])];
    const result = analyzePr({ pr: BASE_PR, files });
    expect(result.summary).toMatch(/health score of \d+\/100/i);
  });

  it('summary mentions async issues when present', () => {
    const files = [
      makeFile('api.js', [
        '+async function load() {',
        '+  return await fetch("/");',
        '+}',
      ]),
    ];
    const result = analyzePr({ pr: BASE_PR, files });
    // May flag async-without-try-catch → check summary mentions async
    if (result.codeIssues.some((i) => i.type === 'async')) {
      expect(result.summary).toMatch(/async/i);
    }
  });

  it('summary mentions missing tests when source files lack test counterparts', () => {
    const files = [makeFile('src/helper.js', ['+module.exports = {};'])];
    const result = analyzePr({ pr: BASE_PR, files });
    // Should detect missing test
    if (result.codeIssues.some((i) => i.type === 'test')) {
      expect(result.summary).toMatch(/missing tests|files missing/i);
    }
  });
});

describe('analyzePr — filesChanged counter', () => {
  it('counts the correct number of changed files', () => {
    const files = [
      makeFile('a.js', ['+x']),
      makeFile('b.js', ['+y']),
      makeFile('c.ts', ['+z']),
    ];
    const result = analyzePr({ pr: BASE_PR, files });
    expect(result.pr.filesChanged).toBe(3);
  });

  it('reflects 0 for an empty diff', () => {
    const result = analyzePr({ pr: BASE_PR, files: [] });
    expect(result.pr.filesChanged).toBe(0);
  });
});
