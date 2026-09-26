'use strict';

const request = require('supertest');
const app = require('../src/app');

// ─────────────────────────────────────────────────────────────────────────────
// Mock the GitHub fetcher so the integration tests don't hit the real network
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('../src/services/githubFetcher', () => ({
  fetchPrData: jest.fn(),
}));

const { fetchPrData } = require('../src/services/githubFetcher');

const MOCK_PR = {
  number: 7,
  title: 'Test PR',
  user: { login: 'tester' },
  state: 'open',
  html_url: 'https://github.com/owner/repo/pull/7',
  additions: 5,
  deletions: 1,
};

const VALID_URL = 'https://github.com/owner/repo/pull/7';

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/analyze-pr — validation', () => {
  it('returns 400 when prUrl is missing', async () => {
    const res = await request(app).post('/api/analyze-pr').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
    expect(res.body.details).toBeInstanceOf(Array);
  });

  it('returns 400 for a non-GitHub URL', async () => {
    const res = await request(app)
      .post('/api/analyze-pr')
      .send({ prUrl: 'https://gitlab.com/owner/repo/pull/1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed URL', async () => {
    const res = await request(app)
      .post('/api/analyze-pr')
      .send({ prUrl: 'not-a-url' });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Success path
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/analyze-pr — success', () => {
  beforeEach(() => {
    fetchPrData.mockResolvedValue({ pr: MOCK_PR, files: [] });
  });

  afterEach(() => jest.clearAllMocks());

  it('returns 200 with expected shape', async () => {
    const res = await request(app).post('/api/analyze-pr').send({ prUrl: VALID_URL });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      healthScore: expect.any(Number),
      summary: expect.any(String),
      pr: expect.objectContaining({ number: 7 }),
      securityAlerts: expect.any(Array),
      codeIssues: expect.any(Array),
      recommendedFixes: expect.any(Array),
    });
  });

  it('returns healthScore of 100 for an empty PR', async () => {
    const res = await request(app).post('/api/analyze-pr').send({ prUrl: VALID_URL });
    expect(res.body.data.healthScore).toBe(100);
  });

  it('returns lower healthScore when secrets are present', async () => {
    fetchPrData.mockResolvedValue({
      pr: MOCK_PR,
      files: [
        {
          filename: 'secrets.js',
          patch:
            '@@ -1,1 +1,1 @@\n+const key = "AKIAIOSFODNN7EXAMPLE";',
        },
      ],
    });
    const res = await request(app).post('/api/analyze-pr').send({ prUrl: VALID_URL });
    expect(res.body.data.healthScore).toBeLessThan(100);
    expect(res.body.data.securityAlerts.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GitHub API error handling
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/analyze-pr — GitHub errors', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => { jest.clearAllMocks(); jest.restoreAllMocks(); });

  it('returns 404 when GitHub returns 404', async () => {
    const err = new Error('Not Found');
    err.response = { status: 404 };
    fetchPrData.mockRejectedValue(err);
    const res = await request(app).post('/api/analyze-pr').send({ prUrl: VALID_URL });
    expect(res.status).toBe(404);
  });

  it('returns 403 when GitHub rate-limits', async () => {
    const err = new Error('Forbidden');
    err.response = { status: 403 };
    fetchPrData.mockRejectedValue(err);
    const res = await request(app).post('/api/analyze-pr').send({ prUrl: VALID_URL });
    expect(res.status).toBe(403);
  });

  it('returns 502 when GitHub is down (5xx)', async () => {
    const err = new Error('Server Error');
    err.response = { status: 500 };
    fetchPrData.mockRejectedValue(err);
    const res = await request(app).post('/api/analyze-pr').send({ prUrl: VALID_URL });
    expect(res.status).toBe(502);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mock mode
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/analyze-pr — mock mode', () => {
  // fetchPrData must NOT be called in any of these cases
  afterEach(() => {
    expect(fetchPrData).not.toHaveBeenCalled();
    jest.clearAllMocks();
  });

  const MOCK_URL = 'https://github.com/mock-org/mock-repo/pull/0';

  it('triggers mock when prUrl contains "mock"', async () => {
    const res = await request(app)
      .post('/api/analyze-pr')
      .send({ prUrl: MOCK_URL });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.healthScore).toBe(42);
  });

  it('triggers mock with ?mock=true query param on a real-looking URL', async () => {
    const res = await request(app)
      .post('/api/analyze-pr?mock=true')
      .send({ prUrl: 'https://github.com/owner/repo/pull/99' });

    expect(res.status).toBe(200);
    expect(res.body.data.healthScore).toBe(42);
  });

  it('triggers mock with ?mock=1 query param', async () => {
    const res = await request(app)
      .post('/api/analyze-pr?mock=1')
      .send({ prUrl: 'https://github.com/owner/repo/pull/1' });

    expect(res.status).toBe(200);
    expect(res.body.data.healthScore).toBe(42);
  });

  it('returns exactly 1 critical security alert (aws-access-key)', async () => {
    const res = await request(app)
      .post('/api/analyze-pr')
      .send({ prUrl: MOCK_URL });

    const { securityAlerts } = res.body.data;
    expect(securityAlerts).toHaveLength(1);
    expect(securityAlerts[0].ruleId).toBe('aws-access-key');
    expect(securityAlerts[0].severity).toBe('critical');
    expect(securityAlerts[0].file).toBe('src/config/aws.js');
    expect(securityAlerts[0].line).toBe(8);
    expect(securityAlerts[0].snippet).toMatch(/AKIAIOSFODNN7EXAMPLE/);
  });

  it('returns exactly 1 high severity async/SQL injection code issue', async () => {
    const res = await request(app)
      .post('/api/analyze-pr')
      .send({ prUrl: MOCK_URL });

    const { codeIssues } = res.body.data;
    expect(codeIssues).toHaveLength(1);
    expect(codeIssues[0].ruleId).toBe('async-without-try-catch');
    expect(codeIssues[0].severity).toBe('high');
    expect(codeIssues[0].file).toBe('src/services/paymentService.js');
    expect(codeIssues[0].line).toBe(23);
    expect(codeIssues[0].snippet).toMatch(/chargeUser/);
    expect(codeIssues[0].snippet).toMatch(/SQL injection|SELECT|db\.query/i);
  });

  it('fix field contains a before/after AI replacement snippet', async () => {
    const res = await request(app)
      .post('/api/analyze-pr')
      .send({ prUrl: MOCK_URL });

    const fix = res.body.data.codeIssues[0].fix;
    // Must contain both a "before" indicator and an "after" indicator
    expect(fix).toMatch(/before/i);
    expect(fix).toMatch(/after/i);
    // Must show the parameterised query replacement
    expect(fix).toMatch(/WHERE id = \?/);
    // Must show try\/catch in the suggested replacement
    expect(fix).toMatch(/try\s*\{/);
    expect(fix).toMatch(/catch/);
  });

  it('returns 2 recommendedFixes ordered critical → high', async () => {
    const res = await request(app)
      .post('/api/analyze-pr')
      .send({ prUrl: MOCK_URL });

    const fixes = res.body.data.recommendedFixes;
    expect(fixes).toHaveLength(2);
    expect(fixes[0].priority).toBe('critical');
    expect(fixes[0].category).toBe('security');
    expect(fixes[1].priority).toBe('high');
    expect(fixes[1].category).toBe('async');
  });

  it('response shape matches the full PRAnalysisResult contract', async () => {
    const res = await request(app)
      .post('/api/analyze-pr')
      .send({ prUrl: MOCK_URL });

    expect(res.body.data).toMatchObject({
      healthScore: 42,
      summary: expect.stringMatching(/health score of 42\/100/i),
      pr: expect.objectContaining({
        title: expect.any(String),
        author: expect.any(String),
        state: 'open',
        filesChanged: expect.any(Number),
        additions: expect.any(Number),
        deletions: expect.any(Number),
      }),
      securityAlerts: expect.any(Array),
      codeIssues: expect.any(Array),
      recommendedFixes: expect.any(Array),
    });
  });

  it('does NOT trigger mock for a real URL without the query param', async () => {
    // fetchPrData will throw (no mock set up), proving it was actually called
    const err = new Error('Not Found');
    err.response = { status: 404 };
    fetchPrData.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/analyze-pr')
      .send({ prUrl: 'https://github.com/real-org/real-repo/pull/5' });

    // fetchPrData was called → 404 bubbled up → NOT a mock response
    expect(res.status).toBe(404);
    jest.clearAllMocks(); // clear so afterEach doesn't double-check
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
