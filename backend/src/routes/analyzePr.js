'use strict';

const express = require('express');
const Joi = require('joi');

const { fetchPrData } = require('../services/githubFetcher');
const { analyzePr } = require('../services/analysisEngine');

const router = express.Router();

// ── Mock response ─────────────────────────────────────────────────────────────
// Returned when the PR URL contains the word "mock" OR ?mock=true is passed.
// Useful for UI development and demos without hitting the GitHub API.
const MOCK_RESULT = {
  healthScore: 42,
  summary:
    'PR #mock "Add payment integration" has a health score of 42/100. ' +
    'Found: 1 security alert (1 critical), 1 async/error-handling issue.',
  pr: {
    number: 0,
    title: 'Add payment integration',
    author: 'mock-user',
    state: 'open',
    url: 'https://github.com/mock-org/mock-repo/pull/0',
    filesChanged: 3,
    additions: 74,
    deletions: 12,
  },
  securityAlerts: [
    {
      type: 'secret',
      ruleId: 'aws-access-key',
      severity: 'critical',
      file: 'src/config/aws.js',
      line: 8,
      label: 'AWS Access Key ID',
      snippet: 'const AWS_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";',
      fix:
        'Remove the hardcoded AWS Access Key ID and load it from an environment variable.\n\n' +
        '// ✗ Before\n' +
        'const AWS_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";\n\n' +
        '// ✓ After\n' +
        'const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;\n' +
        'if (!AWS_ACCESS_KEY) throw new Error("AWS_ACCESS_KEY_ID env var is not set");',
    },
  ],
  codeIssues: [
    {
      type: 'async',
      ruleId: 'async-without-try-catch',
      severity: 'high',
      file: 'src/services/paymentService.js',
      line: 23,
      label: 'Async function with SQL query — missing try/catch and potential injection',
      snippet:
        'async function chargeUser(userId, amount) {\n' +
        '  const user = await db.query(`SELECT * FROM users WHERE id = ${userId}`);\n' +
        '  return stripe.charges.create({ amount, source: user.card_token });\n' +
        '}',
      fix:
        'Wrap in try/catch, use parameterised queries to prevent SQL injection, ' +
        'and validate inputs before calling external APIs.\n\n' +
        '// ✗ Before — unhandled promise + SQL injection risk\n' +
        'async function chargeUser(userId, amount) {\n' +
        '  const user = await db.query(`SELECT * FROM users WHERE id = ${userId}`);\n' +
        '  return stripe.charges.create({ amount, source: user.card_token });\n' +
        '}\n\n' +
        '// ✓ After — parameterised query + error handling\n' +
        'async function chargeUser(userId, amount) {\n' +
        '  if (!Number.isInteger(userId) || amount <= 0) {\n' +
        '    throw new Error("Invalid userId or amount");\n' +
        '  }\n' +
        '  try {\n' +
        '    const [user] = await db.query(\n' +
        '      "SELECT id, card_token FROM users WHERE id = ?",\n' +
        '      [userId]\n' +
        '    );\n' +
        '    if (!user) throw new Error(`User ${userId} not found`);\n' +
        '    return await stripe.charges.create({ amount, source: user.card_token });\n' +
        '  } catch (err) {\n' +
        '    logger.error({ err, userId, amount }, "chargeUser failed");\n' +
        '    throw err;\n' +
        '  }\n' +
        '}',
    },
  ],
  recommendedFixes: [
    {
      priority: 'critical',
      category: 'security',
      file: 'src/config/aws.js',
      line: 8,
      description:
        'Remove the hardcoded AWS_ACCESS_KEY_ID from source code. ' +
        'Store it in a .env file (excluded from git) and load via process.env.AWS_ACCESS_KEY_ID. ' +
        'Rotate the exposed key immediately in the AWS IAM console.',
    },
    {
      priority: 'high',
      category: 'async',
      file: 'src/services/paymentService.js',
      line: 23,
      description:
        'Replace template-literal SQL with a parameterised query (db.query("... WHERE id = ?", [userId])) ' +
        'to eliminate SQL injection. Wrap the entire function body in try/catch and ' +
        'log the error before re-throwing so payment failures are observable.',
    },
  ],
};

// ── Helper: detect mock mode ──────────────────────────────────────────────────
function isMockRequest(prUrl, query) {
  return (
    /mock/i.test(prUrl) ||
    query.mock === 'true' ||
    query.mock === '1'
  );
}

// ── Input validation schema ───────────────────────────────────────────────────
// A mock URL (containing "mock") bypasses the github.com pattern check.
const analyzePrSchema = Joi.object({
  prUrl: Joi.alternatives()
    .try(
      // Real GitHub PR URL
      Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .pattern(/github\.com\/[^/]+\/[^/]+\/pull\/\d+/)
        .messages({
          'string.pattern.base':
            'prUrl must be a valid GitHub PR URL: https://github.com/owner/repo/pull/123',
          'string.uri': 'prUrl must be a valid URL',
        }),
      // Mock URL — any http(s) URL containing "mock"
      Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .pattern(/mock/i)
    )
    .required()
    .messages({ 'any.required': 'prUrl is required' }),
});

// ── POST /api/analyze-pr ──────────────────────────────────────────────────────
router.post('/analyze-pr', async (req, res, next) => {
  // 1. Validate input
  const { error, value } = analyzePrSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      error: 'Validation error',
      details: error.details.map((d) => d.message),
    });
  }

  // 2. Short-circuit with mock data if requested
  if (isMockRequest(value.prUrl, req.query)) {
    return res.json({ success: true, data: MOCK_RESULT });
  }

  // 3. Fetch PR data from GitHub
  let prData;
  try {
    prData = await fetchPrData(value.prUrl);
  } catch (err) {
    // Propagate known status codes (400 = bad URL, 401/403 = auth, 404 = not found)
    if (err.status) return next(err);

    // Octokit HTTP errors carry a `response` property
    if (err.response) {
      const status = err.response.status;
      const messages = {
        401: 'GitHub authentication failed. Provide a valid GITHUB_TOKEN.',
        403: 'GitHub rate limit exceeded or access denied. Provide a GITHUB_TOKEN with appropriate scopes.',
        404: 'PR not found. Verify the URL and ensure the repository is accessible.',
        422: 'GitHub could not process the request. The PR URL may be invalid.',
      };
      const clientErr = new Error(messages[status] || `GitHub API error: ${status}`);
      clientErr.status = status >= 500 ? 502 : status;
      return next(clientErr);
    }

    return next(err);
  }

  // 4. Run analysis engine
  let result;
  try {
    result = analyzePr(prData);
  } catch (err) {
    return next(err);
  }

  // 5. Return structured response
  return res.json({
    success: true,
    data: result,
  });
});

module.exports = router;
