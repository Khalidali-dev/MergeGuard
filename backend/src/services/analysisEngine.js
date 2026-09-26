'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Secret / API-key patterns
// Each entry: { id, label, pattern (RegExp), severity }
// ─────────────────────────────────────────────────────────────────────────────
const SECRET_PATTERNS = [
  {
    id: 'aws-access-key',
    label: 'AWS Access Key ID',
    pattern: /AKIA[0-9A-Z]{16}/,
    severity: 'critical',
  },
  {
    id: 'aws-secret-key',
    label: 'AWS Secret Access Key',
    pattern: /(?:aws[_\-\s]?secret[_\-\s]?(?:access[_\-\s]?)?key\s*[:=]\s*)["']?([A-Za-z0-9/+=]{40})["']?/i,
    severity: 'critical',
  },
  {
    id: 'github-token',
    label: 'GitHub Personal Access Token',
    pattern: /ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82}/,
    severity: 'critical',
  },
  {
    id: 'google-api-key',
    label: 'Google API Key',
    pattern: /AIza[0-9A-Za-z\-_]{35}/,
    severity: 'critical',
  },
  {
    id: 'stripe-key',
    label: 'Stripe Secret Key',
    pattern: /sk_live_[0-9a-zA-Z]{24,}/,
    severity: 'critical',
  },
  {
    id: 'stripe-publishable',
    label: 'Stripe Publishable Key',
    pattern: /pk_live_[0-9a-zA-Z]{24,}/,
    severity: 'high',
  },
  {
    id: 'generic-api-key',
    label: 'Generic API key assignment',
    pattern: /(?:api[_\-]?key|apikey|api[_\-]?secret|auth[_\-]?token|access[_\-]?token)\s*[:=]\s*["'][A-Za-z0-9_\-./+]{16,}["']/i,
    severity: 'high',
  },
  {
    id: 'private-key-block',
    label: 'Private Key block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    severity: 'critical',
  },
  {
    id: 'hardcoded-password',
    label: 'Hardcoded password',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{6,}["']/i,
    severity: 'high',
  },
  {
    id: 'jwt-secret',
    label: 'JWT secret',
    pattern: /(?:jwt[_\-]?secret|token[_\-]?secret)\s*[:=]\s*["'][^"']{8,}["']/i,
    severity: 'high',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Unhandled promise / missing try-catch patterns
// ─────────────────────────────────────────────────────────────────────────────
const ASYNC_ISSUE_PATTERNS = [
  {
    id: 'unhandled-promise-then',
    label: 'Promise .then() without .catch()',
    // matches .then(...) not followed by .catch on the same or next logical line
    pattern: /\.then\s*\([^)]*\)\s*(?![\s\S]*?\.catch)/,
    severity: 'medium',
    description: 'Promise chain missing .catch() — unhandled rejections can crash the process.',
  },
  {
    id: 'floating-promise',
    label: 'Floating (un-awaited) async call',
    // async function called without await, .then, or assignment
    pattern: /^\+\s*(?!.*(?:await|return|const|let|var|=|\.))\w+\s*\([^)]*\)\s*;?\s*\/\/.*async/i,
    severity: 'medium',
    description: 'Async function called without await or promise handling.',
  },
  {
    id: 'empty-catch',
    label: 'Empty catch block',
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    severity: 'medium',
    description: 'Empty catch block silently swallows errors.',
  },
  {
    id: 'async-without-try-catch',
    label: 'async function without try/catch',
    // diff addition line that declares an async function with no try block in same hunk
    pattern: /^\+.*async\s+function\b/,
    severity: 'low',
    description: 'New async function added — verify try/catch error handling is present.',
    requiresHunkContext: true, // checked contextually in analyzer
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Missing test heuristics
// ─────────────────────────────────────────────────────────────────────────────
const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /\/test\//,
];

const TESTABLE_FILE_PATTERNS = [
  /\.(js|ts|jsx|tsx)$/,
];

const IGNORED_FOR_TESTS = [
  /node_modules/,
  /\.d\.ts$/,
  /migrations?\//,
  /seeds?\//,
  /config\//,
  /\.config\.[jt]s$/,
  /index\.[jt]sx?$/, // re-export barrels
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split a unified diff patch into added lines only (lines starting with '+',
 * excluding the '+++' file header).
 */
function extractAddedLines(patch) {
  if (!patch) return [];
  return patch
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'));
}

/**
 * Get the line number within the file for each added line.
 * Parses @@ -a,b +c,d @@ hunk headers.
 */
function mapAddedLinesToNumbers(patch) {
  if (!patch) return [];
  const lines = patch.split('\n');
  const result = [];
  let currentLine = 0;

  for (const line of lines) {
    const hunkHeader = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkHeader) {
      currentLine = parseInt(hunkHeader[1], 10) - 1;
      continue;
    }
    if (line.startsWith('-')) continue; // deleted line, no file-line advance
    if (line.startsWith('\\')) continue; // "No newline at end" marker

    currentLine++;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      result.push({ lineNumber: currentLine, content: line.slice(1) });
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analyzers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan added lines for hardcoded secrets / API keys.
 * @returns {Array<SecurityAlert>}
 */
function analyzeSecrets(files) {
  const alerts = [];

  for (const file of files) {
    const addedLines = mapAddedLinesToNumbers(file.patch);

    for (const { lineNumber, content } of addedLines) {
      for (const rule of SECRET_PATTERNS) {
        if (rule.pattern.test(content)) {
          alerts.push({
            type: 'secret',
            ruleId: rule.id,
            severity: rule.severity,
            file: file.filename,
            line: lineNumber,
            label: rule.label,
            snippet: content.trim().slice(0, 120),
            fix: `Remove the hardcoded ${rule.label} and load it from an environment variable (e.g. process.env.${rule.id.toUpperCase().replace(/-/g, '_')}).`,
          });
          break; // one alert per line — first match wins to avoid duplicates
        }
      }
    }
  }

  return alerts;
}

/**
 * Scan added lines for unhandled promise / async issues.
 * @returns {Array<CodeIssue>}
 */
function analyzeAsyncIssues(files) {
  const issues = [];

  for (const file of files) {
    if (!/\.(js|ts|jsx|tsx|mjs|cjs)$/.test(file.filename)) continue;

    const addedLines = mapAddedLinesToNumbers(file.patch);
    const fullPatch = file.patch || '';

    // Detect async functions added without any try/catch in their hunk
    const asyncFunctionLines = addedLines.filter((l) =>
      /async\s+function\b|async\s+\w+\s*\(|=\s*async\s*\(/.test(l.content)
    );
    for (const { lineNumber, content } of asyncFunctionLines) {
      // Look around ±20 lines in the patch for a try block
      const surroundingPatch = fullPatch;
      const hasTryCatch = /\btry\s*\{/.test(surroundingPatch);
      if (!hasTryCatch) {
        issues.push({
          type: 'async',
          ruleId: 'async-without-try-catch',
          severity: 'medium',
          file: file.filename,
          line: lineNumber,
          label: 'New async function without visible try/catch',
          snippet: content.trim().slice(0, 120),
          fix: 'Wrap the async function body in a try/catch block, or use a centralised error-handling wrapper.',
        });
      }
    }

    // Detect empty catch blocks
    for (const { lineNumber, content } of addedLines) {
      for (const rule of ASYNC_ISSUE_PATTERNS) {
        if (rule.id === 'async-without-try-catch') continue; // handled above
        if (rule.pattern.test(content)) {
          issues.push({
            type: 'async',
            ruleId: rule.id,
            severity: rule.severity,
            file: file.filename,
            line: lineNumber,
            label: rule.label,
            snippet: content.trim().slice(0, 120),
            fix: rule.description,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Check whether changed source files have corresponding test files in the PR.
 * @returns {Array<CodeIssue>}
 */
function analyzeMissingTests(files) {
  const issues = [];

  const allFilenames = new Set(files.map((f) => f.filename));

  const sourceFiles = files.filter((f) => {
    if (!TESTABLE_FILE_PATTERNS.some((p) => p.test(f.filename))) return false;
    if (TEST_FILE_PATTERNS.some((p) => p.test(f.filename))) return false;
    if (IGNORED_FOR_TESTS.some((p) => p.test(f.filename))) return false;
    return true;
  });

  for (const file of sourceFiles) {
    // Build candidate test file paths
    const base = file.filename.replace(/\.[jt]sx?$/, '');
    const candidates = [
      `${base}.test.js`,
      `${base}.test.ts`,
      `${base}.spec.js`,
      `${base}.spec.ts`,
      `${base}.test.jsx`,
      `${base}.test.tsx`,
    ];

    const hasTest = candidates.some((c) => allFilenames.has(c));

    if (!hasTest) {
      issues.push({
        type: 'test',
        ruleId: 'missing-unit-test',
        severity: 'low',
        file: file.filename,
        line: null,
        label: 'No corresponding test file found in this PR',
        snippet: null,
        fix: `Add a test file at one of: ${candidates.slice(0, 2).join(', ')}`,
      });
    }
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_WEIGHTS = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
};

/**
 * Compute a 0-100 health score. Starts at 100, deducts per finding.
 * Score is floored at 0.
 */
function computeHealthScore(securityAlerts, codeIssues) {
  let deduction = 0;
  for (const alert of securityAlerts) {
    deduction += SEVERITY_WEIGHTS[alert.severity] || 5;
  }
  for (const issue of codeIssues) {
    deduction += SEVERITY_WEIGHTS[issue.severity] || 2;
  }
  return Math.max(0, 100 - deduction);
}

/**
 * Build a human-readable summary sentence.
 */
function buildSummary(pr, securityAlerts, codeIssues, healthScore) {
  const totalIssues = securityAlerts.length + codeIssues.length;
  const criticalCount = securityAlerts.filter((a) => a.severity === 'critical').length;

  if (totalIssues === 0) {
    return `PR #${pr.number} "${pr.title}" looks clean — no secrets, async issues, or missing tests detected.`;
  }

  const parts = [];
  if (securityAlerts.length > 0) {
    parts.push(
      `${securityAlerts.length} security alert${securityAlerts.length > 1 ? 's' : ''}${
        criticalCount > 0 ? ` (${criticalCount} critical)` : ''
      }`
    );
  }
  const asyncIssues = codeIssues.filter((i) => i.type === 'async');
  const testIssues = codeIssues.filter((i) => i.type === 'test');
  if (asyncIssues.length > 0)
    parts.push(`${asyncIssues.length} async/error-handling issue${asyncIssues.length > 1 ? 's' : ''}`);
  if (testIssues.length > 0)
    parts.push(`${testIssues.length} file${testIssues.length > 1 ? 's' : ''} missing tests`);

  return (
    `PR #${pr.number} "${pr.title}" has a health score of ${healthScore}/100. ` +
    `Found: ${parts.join(', ')}.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full analysis pipeline on a fetched PR.
 *
 * @param {{ pr: object, files: Array<object> }} prData
 * @returns {AnalysisResult}
 */
function analyzePr({ pr, files }) {
  const securityAlerts = analyzeSecrets(files);
  const codeIssues = [
    ...analyzeAsyncIssues(files),
    ...analyzeMissingTests(files),
  ];

  const healthScore = computeHealthScore(securityAlerts, codeIssues);
  const summary = buildSummary(pr, securityAlerts, codeIssues, healthScore);

  const recommendedFixes = buildRecommendedFixes(securityAlerts, codeIssues);

  return {
    healthScore,
    summary,
    pr: {
      number: pr.number,
      title: pr.title,
      author: pr.user?.login,
      state: pr.state,
      url: pr.html_url,
      filesChanged: files.length,
      additions: pr.additions,
      deletions: pr.deletions,
    },
    securityAlerts,
    codeIssues,
    recommendedFixes,
  };
}

/**
 * Deduplicate and prioritise recommended fixes from all findings.
 */
function buildRecommendedFixes(securityAlerts, codeIssues) {
  const seen = new Set();
  const fixes = [];

  const allFindings = [
    ...securityAlerts.map((a) => ({ ...a, category: 'security' })),
    ...codeIssues.map((i) => ({ ...i, category: i.type })),
  ];

  // Sort: critical → high → medium → low
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  allFindings.sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4));

  for (const finding of allFindings) {
    const key = `${finding.ruleId}:${finding.file}:${finding.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fixes.push({
      priority: finding.severity,
      category: finding.category,
      file: finding.file,
      line: finding.line,
      description: finding.fix,
    });
  }

  return fixes;
}

module.exports = {
  analyzePr,
  analyzeSecrets,
  analyzeAsyncIssues,
  analyzeMissingTests,
  computeHealthScore,
  // exported for testing
  extractAddedLines,
  mapAddedLinesToNumbers,
};
