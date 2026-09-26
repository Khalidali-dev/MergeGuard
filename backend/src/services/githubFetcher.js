'use strict';

const { Octokit } = require('@octokit/rest');

/**
 * Parse a GitHub PR URL into its constituent parts.
 *
 * @param {string} prUrl  e.g. "https://github.com/owner/repo/pull/123"
 * @returns {{ owner: string, repo: string, pull_number: number }}
 */
function parsePrUrl(prUrl) {
  const match = prUrl.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
  );
  if (!match) {
    const err = new Error(
      'Invalid GitHub PR URL. Expected format: https://github.com/owner/repo/pull/123'
    );
    err.status = 400;
    throw err;
  }
  return {
    owner: match[1],
    repo: match[2],
    pull_number: parseInt(match[3], 10),
  };
}

/**
 * Fetch PR metadata and all changed files (with patch diffs) from GitHub.
 *
 * @param {string} prUrl
 * @returns {Promise<{ pr: object, files: Array<object> }>}
 */
async function fetchPrData(prUrl) {
  const { owner, repo, pull_number } = parsePrUrl(prUrl);

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN || undefined,
    userAgent: 'MergeGuard/1.0',
  });

  const [prResponse, filesResponse] = await Promise.all([
    octokit.pulls.get({ owner, repo, pull_number }),
    octokit.pulls.listFiles({ owner, repo, pull_number, per_page: 100 }),
  ]);

  return {
    pr: prResponse.data,
    files: filesResponse.data,
  };
}

module.exports = { fetchPrData, parsePrUrl };
