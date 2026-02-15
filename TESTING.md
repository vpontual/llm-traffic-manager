# Testing Guide

This project uses automated checks in two places:

- Local pre-commit hook (runs before every commit)
- GitHub Actions CI (runs on pull requests and pushes)

## What Runs Automatically

### Pre-Commit Hook

Before a commit is created, the hook runs:

```bash
npm run check
```

`check` includes:

- `npm run lint`
- `npm run typecheck`
- `npm run test`

If any step fails, the commit is blocked.

### CI Workflow

The CI workflow (`.github/workflows/ci.yml`) runs:

```bash
npm ci
npm run check
```

This ensures all PRs and pushes meet the same baseline.

## One-Time Setup (Local)

Install dependencies and configure repo hooks:

```bash
npm install
npm run hooks:install
```

If hooks are not active, set it manually:

```bash
git config core.hooksPath .githooks
```

## Running Tests Manually

### Fast Baseline

```bash
npm run check
```

### Individual Commands

```bash
npm run lint
npm run typecheck
npm test
```

### Smoke Tests

Run against local services:

```bash
npm run smoke
```

Run against Docker-exposed ports:

```bash
npm run smoke:docker
```

Build/start the stack and run smoke in one command:

```bash
npm run smoke:docker:stack
```

## Docker-Only Validation

If your local Node environment has issues, run checks in Docker:

```bash
docker run --rm -v "$PWD:/workspace" -w /workspace node:22-alpine sh -lc "npm ci && npm run check"
```

## Troubleshooting

- Hook did not run:
  - Verify `git config --get core.hooksPath` returns `.githooks`.
- Commit blocked:
  - Run `npm run check` and fix the reported failure.
- Smoke test fails:
  - Ensure app and proxy are running and reachable at the configured URLs.
