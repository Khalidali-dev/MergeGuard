<div align="center">

# 🛡️ MergeGuard

**AI-powered Pull Request analysis that catches secrets, async bugs, and missing tests before they ship.**

[![Flutter](https://img.shields.io/badge/Flutter-3.47-02569B?logo=flutter&logoColor=white)](https://flutter.dev)
[![Dart](https://img.shields.io/badge/Dart-3.13-0175C2?logo=dart&logoColor=white)](https://dart.dev)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.19-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Tests](https://img.shields.io/badge/Tests-175%20passed-3FB950?logo=jest&logoColor=white)](#testing)
[![IBM Bob](https://img.shields.io/badge/Built%20with-IBM%20Bob-0F62FE?logo=ibm&logoColor=white)](https://www.ibm.com)
[![License](https://img.shields.io/badge/License-MIT-8B949E)](LICENSE)

</div>

---

## The Problem

Code review is the last line of defence before a change reaches production — but reviewers are human. They miss things. A hardcoded AWS key buried in a config change, an `async` function added without `try/catch`, a critical service file shipped without a single test: these issues get through every day, creating security incidents, runtime crashes, and untested regressions that are expensive to fix after the fact.

**MergeGuard** is a developer tool that acts as an automated first-pass reviewer. Paste a GitHub PR URL and within seconds you get a structured health report: a 0–100 score, categorised findings sorted by severity, and AI-suggested code replacements — all in a dark-themed dashboard built for developer workflows.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Developer Browser                           │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │            Flutter Web Dashboard  :8080                 │   │
│   │                                                         │   │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │   │
│   │  │ Search   │  │ Health   │  │  Issues & AI Fixes   │  │   │
│   │  │   Bar    │  │  Gauge   │  │  (expandable cards)  │  │   │
│   │  └────┬─────┘  └──────────┘  └──────────────────────┘  │   │
│   │       │  Dio HTTP  POST /api/analyze-pr                 │   │
│   └───────┼─────────────────────────────────────────────────┘   │
└───────────┼─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Node.js / Express API  :5001                   │
│                                                                 │
│   ┌──────────────┐   ┌──────────────────────────────────────┐   │
│   │  Joi schema  │   │        Analysis Engine               │   │
│   │  validation  │──▶│                                      │   │
│   └──────────────┘   │  ┌────────────┐  ┌────────────────┐  │   │
│                      │  │  Secret    │  │  Async / Error │  │   │
│   ┌──────────────┐   │  │  Scanner   │  │  Handler Scan  │  │   │
│   │   Octokit    │   │  └────────────┘  └────────────────┘  │   │
│   │  PR Fetcher  │──▶│  ┌────────────┐  ┌────────────────┐  │   │
│   └──────────────┘   │  │  Missing   │  │ Health Score   │  │   │
│          │           │  │  Test Scan │  │  + Fix Builder │  │   │
│          │           │  └────────────┘  └────────────────┘  │   │
│          ▼           └──────────────────────────────────────┘   │
│   GitHub REST API                                               │
│   (PR metadata + file diffs)                                    │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     IBM Bob Agent                               │
│                                                                 │
│   Scaffolded the full project end-to-end within a single        │
│   conversation session:                                         │
│                                                                 │
│   • Designed the monorepo layout and API contract              │
│   • Implemented all backend services and analysis rules        │
│   • Built every Flutter widget from models → screen            │
│   • Wrote 175 unit + integration tests (100% pass rate)        │
│   • Diagnosed and fixed all runtime issues (port conflicts,    │
│     token length mismatches, widget overflow, etc.)            │
└─────────────────────────────────────────────────────────────────┘
```

### Request Flow

```
User pastes PR URL
       │
       ▼
Flutter validates URL client-side (regex)
       │
       ▼
POST /api/analyze-pr  { prUrl }
       │
       ├─ ?mock=true  ──▶  Return hardcoded critical demo payload
       │
       ▼
Joi server-side validation
       │
       ▼
Octokit fetches PR metadata + all changed files (with unified diffs)
       │
       ▼
Analysis Engine processes each file's added lines:
   ├─ Secret Scanner   (10 regex rules: AWS, GitHub PAT, Stripe, PEM, ...)
   ├─ Async Scanner    (async without try/catch, empty catch, .then no .catch)
   └─ Test Coverage    (source files with no test counterpart in the PR)
       │
       ▼
Health Score = 100 − Σ(severity weights)
RecommendedFixes deduplicated and sorted: critical→high→medium→low
       │
       ▼
JSON response  { success, data: { healthScore, summary, pr,
                  securityAlerts, codeIssues, recommendedFixes } }
       │
       ▼
Flutter parses into PRAnalysisResult, renders dashboard
```

---

## Features

### 🔴 Secret Detection
Scans every **added line** in the diff (deleted lines are ignored) against 10 regex rules:

| Rule | Pattern | Severity |
|---|---|---|
| AWS Access Key ID | `AKIA[0-9A-Z]{16}` | Critical |
| AWS Secret Access Key | `aws_secret…[A-Za-z0-9/+=]{40}` | Critical |
| GitHub Personal Access Token | `ghp_[A-Za-z0-9]{36}` | Critical |
| Google API Key | `AIza[0-9A-Za-z-_]{35}` | Critical |
| Stripe Secret Key | `sk_live_…` | Critical |
| PEM Private Key block | `-----BEGIN … PRIVATE KEY-----` | Critical |
| Stripe Publishable Key | `pk_live_…` | High |
| Generic API key assignment | `apiKey =` / `access_token =` | High |
| Hardcoded password | `password = "…"` | High |
| JWT secret | `jwt_secret = "…"` | High |

### 🟡 Async Bug Detection
- `async function` added without a visible `try/catch` in the same hunk
- Empty `catch` blocks that silently swallow errors
- `.then()` chains without `.catch()` on the same logical line

### 🔵 Test Coverage Gaps
Compares every changed source `.js/.ts/.jsx/.tsx` file against its PR-included test counterparts (`.test.js`, `.spec.ts`, etc.). Skips config files, barrel `index.*` files, migrations, seeds, and `node_modules`.

### 📊 Health Score
Starts at **100** and deducts per finding:

```
Critical  −20    High  −10    Medium  −5    Low  −2
```

Floored at **0**. Grade labels: Excellent ≥ 90 · Good ≥ 75 · Fair ≥ 50 · Poor ≥ 25 · Critical < 25.

### 🤖 AI Suggested Fixes
Each finding includes a structured fix field with:
- Plain-English explanation of the risk
- `// ✗ Before` — the problematic code snippet from the diff
- `// ✓ After` — a safe replacement with parameterised queries, environment variable loading, or proper error handling

### 🎭 Mock Mode
No GitHub token? No problem. Append `?mock=true` to any request or include `mock` in the PR URL to get an instant demo payload: `healthScore: 42`, one critical AWS key leak, one SQL injection + missing try/catch issue — complete with before/after code snippets.

---

## Project Structure

```
MergeGuard/
├── backend/                        Node.js / Express API
│   ├── src/
│   │   ├── app.js                  Express app (helmet, cors, rate-limit)
│   │   ├── index.js                Server entry + graceful shutdown
│   │   ├── routes/
│   │   │   └── analyzePr.js        POST /api/analyze-pr + mock mode
│   │   └── services/
│   │       ├── analysisEngine.js   Diff parser + all analysis rules
│   │       └── githubFetcher.js    Octokit PR + files fetcher
│   ├── __tests__/
│   │   ├── analysisEngine.test.js  Unit tests (engine)
│   │   └── analyzePr.route.test.js Integration tests (HTTP)
│   ├── tests/
│   │   └── diffParser.test.js      131 edge-case tests
│   ├── test-api.sh                 Live smoke-test script
│   └── .env.example                Environment variable template
│
└── frontend/                       Flutter Web dashboard
    └── lib/
        ├── main.dart               App entry, Provider root
        ├── models/
        │   └── analysis_result.dart  PRAnalysisResult + all sub-types
        ├── services/
        │   └── api_service.dart    Dio client, retry, ApiException types
        ├── providers/
        │   └── analysis_provider.dart  ChangeNotifier state machine
        ├── theme/
        │   └── app_theme.dart      Dark palette + Material 3 theme
        └── widgets/
            ├── search_bar_widget.dart   URL input + Analyze button
            ├── health_score_gauge.dart  Animated circular gauge
            ├── stat_cards.dart          4-up responsive stat grid
            ├── issues_list.dart         Expandable finding cards
            ├── pr_info_bar.dart         PR metadata strip
            ├── loading_skeleton.dart    Shimmer placeholder
            └── error_dialog.dart        Typed error modal
```

---

## Screenshots

> **Live demo** — paste any of these into the dashboard search bar:

| URL | What you see |
|---|---|
| `https://github.com/mock-org/mock-repo/pull/0` | Full critical report (score 42, AWS leak + SQL injection) |
| `https://github.com/expressjs/express/pull/5952` | Real PR — live GitHub analysis |

```
┌────────────────────────────────────────────────────────────────────────┐
│  ⬡ MergeGuard  beta              AI-powered PR Analysis                │
├────────────────────────────────────────────────────────────────────────┤
│  🔗 https://github.com/owner/repo/pull/123       [ Analyze PR ]       │
├────────────────────────────────────────────────────────────────────────┤
│  #0  Add payment integration           @mock-user  3 files  +74  -12  │
├────────────────────────────────────────────────────────────────────────┤
│  ℹ  PR #mock has a health score of 42/100. Found: 1 security alert     │
│     (1 critical), 1 async/error-handling issue.                        │
├────────────────────────────────────────────────────────────────────────┤
│  🔵 ── Code Health                                                      │
│                                                                        │
│  ┌─────────────────────┐  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │   Health Score      │  │    1     │ │    1     │ │      0       │  │
│  │                     │  │ Security │ │   Bugs   │ │ Code Smells  │  │
│  │       42            │  │ Alerts   │ │          │ │              │  │
│  │      /100           │  │1 critical│ │1 async   │ │0 untested    │  │
│  │    ● Critical ●     │  └──────────┘ └──────────┘ └──────────────┘  │
│  └─────────────────────┘                                               │
├────────────────────────────────────────────────────────────────────────┤
│  🔵 ── Issues & AI Suggested Fixes  [2]                                 │
│                                                                        │
│  ▌ 🛡  AWS Access Key ID            src/config/aws.js:8   CRITICAL ▾  │
│  │  ✗ Current Code                                                     │
│  │  │ const AWS_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";                   │
│  │  ✓ AI Suggested Fix                              [ Copy ]           │
│  │  │ const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;            │
│                                                                        │
│  ▌ 🐛  Missing try/catch + SQL injection  paymentService.js:23  HIGH ▾ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Local Setup

### Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | ≥ 18 | `node --version` |
| npm | ≥ 9 | `npm --version` |
| Flutter | ≥ 3.10 | `flutter --version` |
| Chrome | Any | Required for Flutter Web dev server |

> **macOS note:** Port 5000 is occupied by AirPlay Receiver. The backend runs on **5001** by default. To free port 5000: *System Settings → General → AirDrop & Handoff → AirPlay Receiver → Off*.

---

### 1 · Clone

```bash
git clone https://github.com/your-org/mergeguard.git
cd mergeguard
```

### 2 · Backend

```bash
cd backend
npm install

# Copy the env template and optionally add a GitHub token
cp .env.example .env
# Edit .env:  GITHUB_TOKEN=ghp_your_token_here
#             PORT=5001

# Start (production)
npm start

# Start (watch mode — auto-restarts on file changes)
npm run dev

# Run all 175 tests
npm test
```

The API is now available at **`http://localhost:5001`**.

### 3 · Frontend

```bash
cd frontend
flutter pub get

# Run in Chrome (dev server with hot reload)
flutter run -d chrome --web-port 8080

# Or build a static web bundle
flutter build web --no-tree-shake-icons
# → output at frontend/build/web/
```

The dashboard is now available at **`http://localhost:8080`**.

### 4 · Full-stack quick start (two terminals)

```bash
# Terminal 1 — backend
cd backend && PORT=5001 npm start

# Terminal 2 — frontend
cd frontend && flutter run -d chrome --web-port 8080
```

---

## API Reference

### `POST /api/analyze-pr`

**Request**
```json
{ "prUrl": "https://github.com/owner/repo/pull/123" }
```

**Query parameters**

| Param | Value | Effect |
|---|---|---|
| `mock` | `true` or `1` | Return the demo critical payload, skip GitHub |

**Response**
```jsonc
{
  "success": true,
  "data": {
    "healthScore": 42,             // 0–100
    "summary": "PR #123 has a health score of 42/100. Found: ...",
    "pr": {
      "number": 123,
      "title": "Add payment integration",
      "author": "dev",
      "state": "open",
      "url": "https://github.com/owner/repo/pull/123",
      "filesChanged": 3,
      "additions": 74,
      "deletions": 12
    },
    "securityAlerts": [
      {
        "type": "secret",
        "ruleId": "aws-access-key",
        "severity": "critical",    // critical | high | medium | low
        "file": "src/config/aws.js",
        "line": 8,
        "label": "AWS Access Key ID",
        "snippet": "const AWS_ACCESS_KEY = \"AKIA...\"",
        "fix": "Remove the hardcoded key and load from process.env..."
      }
    ],
    "codeIssues": [ /* same shape */ ],
    "recommendedFixes": [
      {
        "priority": "critical",
        "category": "security",
        "file": "src/config/aws.js",
        "line": 8,
        "description": "Rotate the key and load from env vars..."
      }
    ]
  }
}
```

**Error responses**

| HTTP | Condition |
|---|---|
| `400` | Missing or malformed `prUrl` |
| `401` | GitHub authentication failure |
| `403` | GitHub rate limit / insufficient token scopes |
| `404` | PR not found |
| `502` | GitHub returned a server error |

### `GET /health`

```json
{ "status": "ok" }
```

---

## Testing

```bash
cd backend
npm test                        # run all 175 tests
npm test -- --verbose           # with per-test output
npm test -- --coverage          # with coverage report
bash test-api.sh                # live smoke test against a running server
```

**Test breakdown**

| Suite | File | Tests |
|---|---|---|
| Analysis engine unit tests | `__tests__/analysisEngine.test.js` | 27 |
| HTTP route integration tests | `__tests__/analyzePr.route.test.js` | 19 |
| Diff parser edge cases | `tests/diffParser.test.js` | 131 |

Edge cases covered: malformed GitHub URLs, empty diffs, deletion-only PRs, all 10 secret rule types, multiple secrets across multiple files, async arrow functions, TypeScript `.ts` files, `.mjs`/`.cjs`, all 15 exclusion rules for missing-test detection, health score floor/ceiling arithmetic, mock mode short-circuit, AI fix content assertions.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the Express server listens on |
| `NODE_ENV` | `development` | Set to `production` to suppress request logs |
| `GITHUB_TOKEN` | — | GitHub PAT — increases rate limit from 60→5000 req/hr; required for private repos |
| `CORS_ORIGIN` | `*` | Restrict CORS to a specific origin in production |

Create `backend/.env` from the template:
```bash
cp backend/.env.example backend/.env
```

---

## Tech Stack

### Backend
| Package | Role |
|---|---|
| `express` 4.19 | HTTP server and routing |
| `@octokit/rest` 20 | GitHub REST API client |
| `joi` 17 | Request schema validation |
| `helmet` 7 | Security headers |
| `express-rate-limit` 7 | Rate limiting (60 req / 15 min) |
| `cors` 2 | Cross-origin resource sharing |
| `dotenv` 16 | Environment variable loading |
| `jest` 29 + `supertest` 7 | Testing framework |

### Frontend
| Package | Role |
|---|---|
| `flutter` 3.47 | UI framework (Web target) |
| `dio` 5 | HTTP client with retry + typed errors |
| `provider` 6 | State management (ChangeNotifier) |
| `google_fonts` 6 | Inter + JetBrains Mono typefaces |
| `flutter_animate` 4 | Declarative entrance animations |
| `percent_indicator` 4 | Animated circular health gauge |

---

## IBM Bob Agent Workflow

MergeGuard was scaffolded entirely within a single IBM Bob conversation session. The agent:

1. **Designed** the monorepo layout, API contract, and JSON response schema
2. **Implemented** the Node.js analysis engine with 10 secret rules, async detection, and test coverage heuristics
3. **Built** the Flutter Web dashboard — every model, service, provider, and widget
4. **Wrote** 175 unit and integration tests, ran them, diagnosed 5 initial failures (token length mismatch, wrong test expectations), and fixed all of them
5. **Debugged** runtime issues: port conflicts (`EADDRINUSE`), Flutter `SearchBar` name collision, `withOpacity` deprecation warnings, `_CountBadge` unused class warning
6. **Added** the mock mode endpoint and error dialog system
7. **Improved** responsive layout: `PrInfoBar` overflow on narrow screens, stat card aspect ratio, section labels with staggered animations

The only human inputs were PR URL paste and feature requests — all code was written, tested, and verified by the agent.

---

## Roadmap

- [ ] Support GitLab and Bitbucket PR URLs
- [ ] AI-powered fix suggestions via LLM API integration
- [ ] PR comment posting — write findings back to GitHub as review comments
- [ ] Historical score tracking — trend chart per repository
- [ ] CI/CD integration — GitHub Action that blocks merge if `healthScore < threshold`
- [ ] Custom rule authoring — YAML-defined secret patterns per organisation

---

## License

MIT © 2025 MergeGuard Contributors
