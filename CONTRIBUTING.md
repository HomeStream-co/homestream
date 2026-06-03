# Contributing to HomeStream

Thank you for your interest in contributing. This document covers everything
you need to get started.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)

---

## Code of Conduct

Be respectful. Constructive criticism is welcome; personal attacks are not.
We are all here to build something useful.

---

## How to Contribute

| Type | How |
|------|-----|
| Bug fix | Open an issue first (unless trivial), then a PR |
| New feature | Open a feature request issue and discuss before coding |
| Documentation | PR directly -- no issue needed |
| Tests | Always welcome -- PR directly |
| Refactor | Open an issue first to align on scope |

---

## Development Setup

### Prerequisites

- **Node.js 22+** (`node --version`)
- **npm 10+** (`npm --version`)
- **Git**
- FFmpeg is bundled via `ffmpeg-static` -- no manual install needed

### Clone and install

```bash
git clone https://github.com/HomeStream-co/homestream.git
cd homestream
npm install
```

### Start the dev server

```bash
npm run dev
```

Opens at `http://localhost:3000`. Vite HMR handles frontend changes instantly.
Server-side changes (files in `src/server/`) are hot-reloaded by Vite's
`ssrLoadModule` -- no restart needed for most changes.

### Environment

The setup wizard handles all configuration on first run. For development you
can skip the wizard by creating a `homestream-config.json` in the project root
with `"setupComplete": true` and the keys you need.

---

## Project Structure

```
src/
  components/       React components
  context/          React context providers (Auth, Media, Profile, Theme, TMDB)
  hooks/            Custom React hooks
  pages/            Route-level pages
    setup/          5-step setup wizard (StepSysReqs, StepMediaFolder,
                    StepApiKeys, StepOptional, StepFinish)
  server/           Express server modules
    api/            API route handlers -- one file per HTTP method per route
                    (vite-plugin-api-routes auto-discovers these)
  test/             Vitest test suite
    server/         Server/API tests
    ui/             React component tests
    profiles/       Profile and rating gate tests
    jellyfin/       Jellyfin compatibility tests
    hooks/          Hook tests
  types/            Shared TypeScript types

electron/           Electron main process and builder config
aur/                Arch Linux AUR package
.github/
  workflows/        CI and release workflows
  ISSUE_TEMPLATE/   Bug report and feature request templates
scripts/            Build and CI helper scripts
```

### Adding a new API route

1. Create the handler file at `src/server/api/<path>/<METHOD>.ts`
2. Export a single default function: `export default async function handler(req, res) { ... }`
3. That's it -- `vite-plugin-api-routes` auto-discovers and registers it

Example:

```typescript
// src/server/api/widgets/GET.ts
import type { Request, Response } from 'express';

export default async function handler(req: Request, res: Response) {
  res.json({ widgets: [] });
}
```

---

## Coding Standards

### TypeScript

- Strict mode is enabled -- no `any` without a comment explaining why
- Prefer explicit return types on exported functions
- Use `unknown` over `any` for untrusted data (API responses, JSON parse)

### React

- Functional components only
- Keep components under ~300 lines; split into sub-components if larger
- Co-locate component-specific hooks in the same file unless reused elsewhere
- Use `useCallback` and `useMemo` only when there is a measurable benefit

### Server

- All shell commands use `execFileSync` (never `exec` with string interpolation)
- Pure-JS packages only -- no native addons (production runs Alpine/musl)
  - Use `bcryptjs` not `bcrypt`
  - Use `jimp` not `sharp` or `canvas`
- Use `process.env.VITEST` to guard test-only code paths (not `NODE_ENV === 'test'`
  -- Vitest sets `NODE_ENV = "development"`)

### Style

- Tailwind CSS for all styling -- no inline styles except for dynamic values
- Semantic color variables only (`bg-primary`, `text-muted-foreground`) -- never hardcoded hex
- `lucide-react` for icons

### Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Prowlarr indexer source
fix: rate limiter not persisting on clean shutdown
docs: update setup wizard README section
test: add 5 rating gate edge case tests
refactor: extract pickBestStream into shared util
chore: bump electron to 33.x
```

---

## Testing

All changes must maintain the passing test suite. New features should include tests.

```bash
# Run all tests
npm test

# Run a specific test file
npm test -- src/test/server/auth.test.ts

# Run with verbose output
npm test -- --reporter=verbose

# Run in watch mode (development)
npm test -- --watch
```

### Test conventions

- Server tests live in `src/test/server/`
- UI tests live in `src/test/ui/`
- Use `vi.advanceTimersByTime(ms)` for timer-dependent tests -- never `vi.runAllTimers()`
  (it fires the 30-minute rate-limit prune interval and breaks tests)
- Never use `vi.resetModules()` in test files -- it clears the mock registry
- Use `process.env.VITEST` guards in source files, not `NODE_ENV === 'test'`

---

## Submitting a Pull Request

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes** following the coding standards above.

3. **Add or update tests** for any changed behaviour.

4. **Verify everything passes locally:**
   ```bash
   npm run lint
   npm test -- --run
   npm run build
   ```

5. **Push** your branch and open a pull request against `main`.

6. **Fill in the PR template** -- describe what changed and why.

7. A maintainer will review within a few days. Please be patient and responsive
   to feedback.

### PR checklist

- [ ] Tests pass (`npm test -- --run`)
- [ ] Lint passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] New behaviour is covered by tests
- [ ] CHANGELOG.md updated (for user-visible changes)
- [ ] No non-ASCII characters in `.github/workflows/*.yml` files

---

## Reporting Bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template.

Please include:
- HomeStream version (shown in Settings > About)
- OS and version
- Steps to reproduce
- Expected vs actual behaviour
- Relevant logs (Settings > Debug > Copy Logs)

---

## Requesting Features

Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) template.

Describe the problem you are trying to solve, not just the solution you have
in mind. This helps us find the best approach together.
